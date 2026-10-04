import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GCCNTRI_RE = /\b(gccntri|graph\s+centrality\s+contact|centrality\s+contact\s+invest(?:igation)?|top\s+node\s+contact|graph\s+node\s+contact\s+case|centrality\s+investigation|top\s+influence\s+contact|top\s+influence\s+invest(?:igation)?|centrality\s+contact\s+case|graph\s+centrality\s+invest(?:igation)?|untracked\s+centrality|untracked\s+graph\s+node|graph\s+node\s+contact\s+invest(?:igation)?|high\s+influence\s+node\s+contact|centrality\s+node\s+invest(?:igation)?)\b/i;

const THRESHOLD = 0.08;

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

function normaliseCentralityNodes(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.nodes) ? data.nodes
    : Array.isArray(data.centrality) ? data.centrality
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(n => ({
    id: n.id || n._id || String(Math.random()),
    name: n.name || n.label || n.title || 'Unnamed Node',
    type: n.type || n.node_type || n.kind || '',
    category: n.category || '',
    score: typeof n.score === 'number' ? n.score
      : typeof n.centrality_score === 'number' ? n.centrality_score
      : typeof n.centrality === 'number' ? n.centrality
      : typeof n.rank === 'number' ? n.rank
      : 0,
    description: n.description || n.summary || '',
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
    id: c.id || c._id || String(Math.random()),
    name: c.name || c.full_name || c.title || 'Unnamed Contact',
    email: c.email || '',
    company: c.company || c.organisation || c.organization || '',
    role: c.role || c.position || c.title || '',
    description: c.description || c.summary || c.bio || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || ''),
    raw: c,
  }));
}

function normaliseInvestigations(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.investigations) ? data.investigations
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(i => ({
    id: i.id || i._id || String(Math.random()),
    name: i.name || i.title || i.label || 'Unnamed Investigation',
    kind: i.kind || i.type || i.category || '',
    status: i.status || i.state || '',
    description: i.description || i.summary || '',
    tags: Array.isArray(i.tags) ? i.tags.join(' ') : String(i.tags || ''),
    raw: i,
  }));
}

function correlate(nodes, contacts, investigations) {
  return nodes.map(node => {
    const toks = tok([node.name, node.type, node.category, node.description, node.tags].join(' '));

    const matchedContacts = contacts
      .map(c => {
        const score = Math.max(
          matchScore(toks, c.name),
          matchScore(toks, c.email),
          matchScore(toks, c.company),
          matchScore(toks, c.role),
          matchScore(toks, c.description),
          matchScore(toks, c.tags),
        );
        return { ...c, score };
      })
      .filter(c => c.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedInvestigations = investigations
      .map(inv => {
        const score = Math.max(
          matchScore(toks, inv.name),
          matchScore(toks, inv.kind),
          matchScore(toks, inv.status),
          matchScore(toks, inv.description),
          matchScore(toks, inv.tags),
        );
        return { ...inv, score };
      })
      .filter(inv => inv.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasContact = matchedContacts.length > 0;
    const hasInvestigation = matchedInvestigations.length > 0;

    let state;
    if (hasContact && hasInvestigation) state = 'FULLY TRACKED';
    else if (hasContact) state = 'CONTACT-MAPPED';
    else if (hasInvestigation) state = 'INVESTIGATED';
    else state = 'UNTRACKED';

    return { node, matchedContacts, matchedInvestigations, state };
  });
}

export function isGccntriQuery(t) {
  return GCCNTRI_RE.test(t || '');
}

export async function buildGccntriScript() {
  try {
    const [nRes, cRes, iRes] = await Promise.allSettled([
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : null),
    ]);
    const nodes = normaliseCentralityNodes(nRes.status === 'fulfilled' ? nRes.value : null);
    const contacts = normaliseContacts(cRes.status === 'fulfilled' ? cRes.value : null);
    const investigations = normaliseInvestigations(iRes.status === 'fulfilled' ? iRes.value : null);
    const rows = correlate(nodes, contacts, investigations);
    const fully = rows.filter(r => r.state === 'FULLY TRACKED').length;
    const contactMapped = rows.filter(r => r.state === 'CONTACT-MAPPED').length;
    const investigated = rows.filter(r => r.state === 'INVESTIGATED').length;
    const untracked = rows.filter(r => r.state === 'UNTRACKED').length;
    return `GCCNTRI Graph Centrality×Contact×Investigation: ${rows.length} top-influence nodes analysed. ` +
      `${fully} FULLY TRACKED (contact + investigation), ` +
      `${contactMapped} CONTACT-MAPPED (person link only), ${investigated} INVESTIGATED (case only), ${untracked} UNTRACKED (no coverage). ` +
      (untracked > 0 ? `${untracked} high-influence nodes have no contact or investigation coverage — operational blind spot.` :
        fully > 0 ? `Top tracked: ${rows.find(r => r.state === 'FULLY TRACKED')?.node.name || 'see panel'}.` :
        'No fully tracked centrality nodes at this time.');
  } catch {
    return 'GCCNTRI: data fetch failed.';
  }
}

export default function GraphCentralityContactInvestTriple() {
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
    window.addEventListener('jarvis:gccntri-toggle', handler);
    return () => window.removeEventListener('jarvis:gccntri-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [nRes, cRes, iRes] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const nodes = normaliseCentralityNodes(nRes.status === 'fulfilled' ? nRes.value : null);
      const contacts = normaliseContacts(cRes.status === 'fulfilled' ? cRes.value : null);
      const investigations = normaliseInvestigations(iRes.status === 'fulfilled' ? iRes.value : null);
      if (!nodes.length && !contacts.length && !investigations.length) {
        setErr('No data returned from Graph Centrality, Contact, or Investigations endpoints.');
      }
      setRows(correlate(nodes, contacts, investigations));
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

  const fully = rows.filter(r => r.state === 'FULLY TRACKED').length;
  const contactMapped = rows.filter(r => r.state === 'CONTACT-MAPPED').length;
  const investigated = rows.filter(r => r.state === 'INVESTIGATED').length;
  const untracked = rows.filter(r => r.state === 'UNTRACKED').length;

  const TABS = ['ALL', 'FULLY TRACKED', 'CONTACT-MAPPED', 'INVESTIGATED', 'UNTRACKED'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.node.name.toLowerCase().includes(q) ||
        r.matchedContacts.some(c => c.name.toLowerCase().includes(q)) ||
        r.matchedInvestigations.some(i => i.name.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const cbw = total > 0 ? {
    fully: (fully / total) * 100,
    contact: (contactMapped / total) * 100,
    investigated: (investigated / total) * 100,
    untracked: (untracked / total) * 100,
  } : { fully: 0, contact: 0, investigated: 0, untracked: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Graph centrality node "${row.node.name}" [${row.state}] (type: ${row.node.type || 'unknown'}): ` +
      `matched contacts: ${row.matchedContacts.map(c => c.name).join(', ') || 'none'}. ` +
      `matched investigations: ${row.matchedInvestigations.map(i => i.name).join(', ') || 'none'}. ` +
      `Centrality score: ${row.node.score}. ` +
      `Give a 2-sentence high-influence node operational coverage brief.`;
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
    'FULLY TRACKED': '#00e5ff',
    'CONTACT-MAPPED': '#69f0ae',
    'INVESTIGATED': '#ce93d8',
    'UNTRACKED': '#555',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 815680,
          bottom: 8,
          zIndex: 485,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #55555544',
          color: '#aaa',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ GCCNTRI
        {untracked > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#555',
            color: '#eee',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {untracked}
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
      zIndex: 485,
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
        padding: '10px 14px 8px',
        borderBottom: '1px solid #00e5ff33',
        background: 'rgba(0,229,255,0.06)',
        position: 'sticky',
        top: 0,
        zIndex: 2,
      }}>
        <div>
          <span style={{ color: '#00e5ff', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>◈ GCCNTRI</span>
          <span style={{ color: '#4a6fa0', marginLeft: 10, fontSize: 10 }}>
            Graph Centrality × Contact × Investigation
          </span>
          {lastRefresh && (
            <span style={{ color: '#2a4060', marginLeft: 10, fontSize: 9 }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#00e5ff', fontSize: 10 }}>◌ LOADING</span>}
          <button onClick={load} style={{ background: 'none', border: '1px solid #00e5ff44', color: '#00e5ff', padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 10 }}>↻</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#4a6fa0', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px 6px', flexWrap: 'wrap' }}>
        {[
          { label: 'NODES', val: total, col: '#00e5ff' },
          { label: 'FULLY TRACKED', val: fully, col: '#00e5ff' },
          { label: 'CONTACT-MAPPED', val: contactMapped, col: '#69f0ae' },
          { label: 'INVESTIGATED', val: investigated, col: '#ce93d8' },
          { label: 'UNTRACKED', val: untracked, col: '#555' },
        ].map(t => (
          <div key={t.label} style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${t.col}44`,
            borderRadius: 4,
            padding: '4px 10px',
            minWidth: 80,
            textAlign: 'center',
          }}>
            <div style={{ color: t.col, fontSize: 16, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: '#4a6fa0', fontSize: 9, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {total > 0 && (
        <div style={{ margin: '0 14px 8px', height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: '#111' }}>
          <div style={{ width: `${cbw.fully}%`, background: '#00e5ff', transition: 'width 0.4s' }} />
          <div style={{ width: `${cbw.contact}%`, background: '#69f0ae', transition: 'width 0.4s' }} />
          <div style={{ width: `${cbw.investigated}%`, background: '#ce93d8', transition: 'width 0.4s' }} />
          <div style={{ width: `${cbw.untracked}%`, background: '#333', transition: 'width 0.4s' }} />
        </div>
      )}

      {/* Error */}
      {err && <div style={{ color: '#f44', padding: '4px 14px', fontSize: 10 }}>{err}</div>}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '4px 14px 6px', flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              background: filter === tab ? '#00e5ff22' : 'none',
              border: `1px solid ${filter === tab ? '#00e5ff' : '#1a3050'}`,
              color: filter === tab ? '#00e5ff' : '#4a6fa0',
              padding: '2px 8px',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 10,
              letterSpacing: 0.5,
            }}
          >{tab}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search nodes…"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid #1a3050',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 10,
            outline: 'none',
            marginLeft: 'auto',
            width: 160,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ padding: '0 14px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#2a4060', textAlign: 'center', padding: 20, fontSize: 11 }}>
            No nodes match current filter.
          </div>
        )}
        {visible.map(row => (
          <div key={row.node.id} style={{
            marginBottom: 6,
            border: `1px solid ${STATE_COLOUR[row.state]}33`,
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            {/* Row header */}
            <div
              onClick={() => setExpanded(expanded === row.node.id ? null : row.node.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                cursor: 'pointer',
                background: expanded === row.node.id ? `${STATE_COLOUR[row.state]}11` : 'transparent',
              }}
            >
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: STATE_COLOUR[row.state],
                background: `${STATE_COLOUR[row.state]}22`,
                padding: '1px 5px',
                borderRadius: 3,
                letterSpacing: 1,
                minWidth: 110,
                textAlign: 'center',
              }}>{row.state}</span>
              <span style={{ color: '#c8e6ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.node.name}
              </span>
              {row.node.type && (
                <span style={{ color: '#2a4060', fontSize: 9 }}>{row.node.type}</span>
              )}
              {row.node.score > 0 && (
                <span style={{ color: '#00e5ff88', fontSize: 9 }}>
                  {typeof row.node.score === 'number' ? row.node.score.toFixed(3) : row.node.score}
                </span>
              )}
              <span style={{ color: '#69f0ae', fontSize: 9 }}>{row.matchedContacts.length}C</span>
              <span style={{ color: '#ce93d8', fontSize: 9 }}>{row.matchedInvestigations.length}I</span>
              <button
                onClick={e => { e.stopPropagation(); assess(row); }}
                disabled={assessing}
                style={{
                  background: 'rgba(0,229,255,0.12)',
                  border: '1px solid #00e5ff55',
                  color: '#00e5ff',
                  padding: '2px 6px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 9,
                  letterSpacing: 0.5,
                }}
              >ASSESS</button>
              <span style={{ color: '#2a4060', fontSize: 10 }}>{expanded === row.node.id ? '▲' : '▼'}</span>
            </div>

            {/* Expand: split pane */}
            {expanded === row.node.id && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1,
                borderTop: `1px solid ${STATE_COLOUR[row.state]}22`,
                background: 'rgba(0,8,20,0.6)',
              }}>
                {/* Left: Contacts */}
                <div style={{ padding: '8px 10px', borderRight: '1px solid #1a3050' }}>
                  <div style={{ color: '#69f0ae', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>CONTACTS ({row.matchedContacts.length})</div>
                  {row.matchedContacts.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No contact match</div>
                  ) : row.matchedContacts.slice(0, 5).map(c => (
                    <div key={c.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{c.name}</div>
                      {(c.role || c.company) && (
                        <div style={{ color: '#4a6fa0', fontSize: 9 }}>{c.role}{c.role && c.company ? ' · ' : ''}{c.company}</div>
                      )}
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(c.score * 100)}%`, background: '#69f0ae', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right: Investigations */}
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ color: '#ce93d8', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>INVESTIGATIONS ({row.matchedInvestigations.length})</div>
                  {row.matchedInvestigations.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No investigation match</div>
                  ) : row.matchedInvestigations.slice(0, 5).map(i => (
                    <div key={i.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{i.name}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {i.kind && <span style={{ color: '#4a6fa0', fontSize: 9 }}>{i.kind}</span>}
                        {i.status && <span style={{ color: '#ce93d8', fontSize: 9, background: '#ce93d822', borderRadius: 2, padding: '0 3px' }}>{i.status}</span>}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(i.score * 100)}%`, background: '#ce93d8', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Node description if available */}
                {row.node.description && (
                  <div style={{ gridColumn: '1 / -1', padding: '6px 10px', borderTop: '1px solid #1a3050' }}>
                    <span style={{ color: '#2a4060', fontSize: 9 }}>NODE: </span>
                    <span style={{ color: '#4a6fa0', fontSize: 10 }}>{row.node.description.slice(0, 200)}{row.node.description.length > 200 ? '…' : ''}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
