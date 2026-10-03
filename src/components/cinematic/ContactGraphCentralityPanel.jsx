import { useState, useEffect, useCallback } from 'react';

const API = '';
const CGCP_RE = /\b(contact[._-]?centrality|network[._-]?contacts|cgcp|influential[._-]?contacts|high[._-]?centrality[._-]?contacts|contacts[._-]?by[._-]?network|contact[._-]?graph[._-]?centrality|contact[._-]?network[._-]?influence|which[._-]?contacts[._-]?are[._-]?most[._-]?networked|contact[._-]?network[._-]?rank)\b/i;

export function isCgcpQuery(t) {
  return CGCP_RE.test(t || '');
}

export async function buildCgcpScript() {
  const [ctR, cnR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
  ]);
  const contacts = normaliseArray(ctR.status === 'fulfilled' ? ctR.value : []);
  const nodes = normaliseCentrality(cnR.status === 'fulfilled' ? cnR.value : []);
  const enriched = correlate(contacts, nodes);
  const linked = enriched.filter(c => c._linked).length;
  const peripheral = enriched.filter(c => !c._linked).length;
  const top = enriched.filter(c => c._linked).slice(0, 4).map(c => c.name || c.title || c.id || '?').join(', ');
  return `Contact × Graph Centrality: ${contacts.length} contacts, ${nodes.length} centrality nodes indexed. ` +
    `${linked} contacts are HIGH-CENTRALITY (graph-linked); ${peripheral} are PERIPHERAL (no graph node match). ` +
    `Top networked contacts: ${top || 'none'}.`;
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'contacts', 'records', 'entities']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseCentrality(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['nodes', 'items', 'results', 'data', 'centrality']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(contact, node) {
  const cToks = new Set([
    ...tokens(contact.name),
    ...tokens(contact.title),
    ...tokens(contact.email),
    ...tokens(contact.company),
    ...tokens(contact.role),
    ...tokens(contact.label),
  ].filter(Boolean));
  const nToks = [
    ...tokens(node.id),
    ...tokens(node.name),
    ...tokens(node.label),
    ...tokens(node.type),
  ].filter(Boolean);
  if (!cToks.size || !nToks.length) return 0;
  let hits = 0;
  for (const t of nToks) if (cToks.has(t)) hits++;
  return hits / Math.max(cToks.size, nToks.length);
}

function correlate(contacts, nodes) {
  return contacts.map(contact => {
    const scored = nodes
      .map(node => ({ node, score: matchScore(contact, node) }))
      .filter(x => x.score > 0)
      .sort((a, b) => {
        const cScore = (b.node.centrality_score || b.node.score || 0) - (a.node.centrality_score || a.node.score || 0);
        if (cScore !== 0) return cScore;
        return b.score - a.score;
      })
      .slice(0, 4);
    return { ...contact, _matches: scored, _linked: scored.length > 0 };
  });
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

function centralityColor(score) {
  if (!score && score !== 0) return '#64748b';
  if (score >= 0.7) return '#22c55e';
  if (score >= 0.4) return '#f59e0b';
  return '#60a5fa';
}

export default function ContactGraphCentralityPanel() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [ctR, cnR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
      ]);
      const c = normaliseArray(ctR.status === 'fulfilled' ? ctR.value : []);
      const n = normaliseCentrality(cnR.status === 'fulfilled' ? cnR.value : []);
      setContacts(c);
      setNodes(n);
      setEnriched(correlate(c, n));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:cgcp-toggle', h);
    return () => window.removeEventListener('jarvis:cgcp-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const linked = enriched.filter(c => c._linked);
    const peripheral = enriched.filter(c => !c._linked);
    const prompt =
      `Contact × Graph Centrality: ${contacts.length} contacts, ${nodes.length} centrality nodes. ` +
      `${linked.length} are HIGH-CENTRALITY; ${peripheral.length} are PERIPHERAL. ` +
      `Top networked: ${linked.slice(0, 5).map(c => c.name || c.title || c.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence network influence brief.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.answer || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const linkedCount = enriched.filter(c => c._linked).length;
  const peripheralCount = enriched.filter(c => !c._linked).length;
  const badge = linkedCount > 0 ? '#22c55e' : '#64748b';

  const visible = enriched.filter(contact => {
    const label = (contact.name || contact.title || contact.email || contact.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'HIGH-CENTRALITY') return contact._linked;
    if (tab === 'PERIPHERAL') return !contact._linked;
    return true;
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Contact × Graph Centrality Panel"
        style={{
          position: 'fixed',
          left: 456720,
          bottom: 8,
          zIndex: 193,
          background: 'rgba(15,23,42,0.85)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color: '#e2e8f0',
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          letterSpacing: 1,
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: badge,
          boxShadow: linkedCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        CGCP
        {linkedCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {linkedCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 560,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9602,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#22c55e' }}>◈ CONTACT × GRAPH CENTRALITY</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 6, color: '#22c55e', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'CONTACTS', val: contacts.length, color: '#60a5fa' },
              { label: 'CENTRAL NODES', val: nodes.length, color: '#a78bfa' },
              { label: 'HIGH-CENTRALITY', val: linkedCount, color: '#22c55e' },
              { label: 'PERIPHERAL', val: peripheralCount, color: peripheralCount > 0 ? '#64748b' : '#22c55e' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assessment block */}
          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, fontSize: 12, color: '#86efac', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'HIGH-CENTRALITY', 'PERIPHERAL'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#22c55e' : '#94a3b8',
                  padding: '3px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: tab === t ? 700 : 400,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {/* Status / error */}
          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No contacts match the current filter.</div>
          )}

          {/* Contact rows */}
          <div>
            {visible.map((contact, i) => {
              const id = contact.id || contact.contact_id || i;
              const label = contact.name || contact.title || contact.email || `Contact ${id}`;
              const role = contact.role || contact.company || contact.type || '';
              const isExp = expanded === id;
              return (
                <div
                  key={id}
                  style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      ...PILL,
                      background: contact._linked ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
                      color: contact._linked ? '#22c55e' : '#64748b',
                      border: `1px solid ${contact._linked ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.25)'}`,
                    }}>
                      {contact._linked ? 'HIGH-CENTRALITY' : 'PERIPHERAL'}
                    </span>
                    {role && (
                      <span style={{ ...PILL, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
                        {role}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {contact.email && contact.email !== label && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{contact.email}</div>
                      )}
                      {contact._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched graph centrality nodes:</div>
                          {contact._matches.map(({ node, score }, j) => {
                            const nodeLabel = node.name || node.label || node.id || `node-${j}`;
                            const nodeType = node.type || node.kind || '';
                            const centralityScore = node.centrality_score ?? node.score ?? null;
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#a78bfa', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nodeLabel}</span>
                                  {nodeType && (
                                    <span style={{ ...PILL, background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)' }}>
                                      {nodeType}
                                    </span>
                                  )}
                                  {centralityScore !== null && (
                                    <span style={{ color: centralityColor(centralityScore), fontSize: 10, fontWeight: 600 }}>
                                      c={Number(centralityScore).toFixed(3)}
                                    </span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}% match</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#22c55e', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#64748b', fontSize: 11 }}>No graph centrality node matched — contact is peripheral to the knowledge graph.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} contacts · {nodes.length} centrality nodes indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
