import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const THRESHOLD = 0.07;

const CGNTOE_RE = /\b(cgntoe|contact\s+centrality\s+ops|contact\s+graph\s+centrality\s+ops|contact\s+node\s+ops|contact\s+high\s+influence\s+ops|contact\s+ops\s+centrality|fully\s+alarmed\s+contact\s+centrality|contact\s+centrality\s+event|contact\s+ops\s+node|graph\s+centrality\s+contact\s+ops|contact\s+network\s+ops)\b/i;

export function isCgntoeQuery(t) {
  return CGNTOE_RE.test(t || '');
}

export async function buildCgntoeScript() {
  try {
    const [contactRes, nodeRes, opsRes] = await Promise.all([
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
    ]);
    const contacts = normaliseContacts(contactRes);
    const nodes = normaliseNodes(nodeRes);
    const events = normaliseEvents(opsRes);
    const classified = contacts.map(c => classifyContact(c, nodes, events));
    const alarmed = classified.filter(c => c.state === 'FULLY_ENGAGED').length;
    const clear = classified.filter(c => c.state === 'DORMANT').length;
    return `CGNTOE analysis: ${contacts.length} contacts cross-referenced against ${nodes.length} high-influence centrality nodes and ${events.length} live ops events. ${alarmed} contacts are FULLY ALARMED — both graph node presence and operational event trigger confirmed. ${clear} contacts are CLEAR — no centrality node alignment or ops event coverage detected.`;
  } catch {
    return 'CGNTOE data unavailable — check /entities/Contact, /v1/graph/centrality, and /v1/ops/events endpoints.';
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
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.contacts) ? raw.contacts
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((c, i) => ({
    id: c.id || c._id || `contact-${i}`,
    label: c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    title: c.title || c.role || c.position || '',
    company: c.company || c.organization || c.employer || '',
    _searchText: [c.name, c.full_name, c.display_name, c.email, c.company, c.organization, c.title, c.role, c.description, c.tags].filter(Boolean).join(' '),
  }));
}

function normaliseNodes(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.nodes) ? raw.nodes
    : Array.isArray(raw.centrality) ? raw.centrality
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((n, i) => ({
    id: n.id || n._id || `node-${i}`,
    label: n.label || n.name || n.entity || `Node ${i + 1}`,
    type: n.entity_type || n.type || n.category || '',
    score: typeof n.centrality_score === 'number' ? n.centrality_score : typeof n.score === 'number' ? n.score : 0,
    _searchText: [n.label, n.name, n.entity, n.entity_type, n.type, n.category, n.description].filter(Boolean).join(' '),
  }));
}

function normaliseEvents(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.events) ? raw.events
    : Array.isArray(raw.ops_events) ? raw.ops_events
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((e, i) => ({
    id: e.id || e._id || `evt-${i}`,
    label: e.name || e.title || e.type || `Event ${i + 1}`,
    severity: e.severity || e.level || e.priority || '',
    type: e.type || e.event_type || e.category || '',
    _searchText: [e.name, e.title, e.type, e.category, e.description, e.service, e.severity, e.tags].filter(Boolean).join(' '),
  }));
}

function classifyContact(contact, nodes, events) {
  const toks = tok(contact._searchText);
  const nodeMatches = nodes
    .map(n => ({ ...n, score: Math.max(matchScore(toks, n._searchText), matchScore(tok(n._searchText), contact._searchText)) }))
    .filter(n => n.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const eventMatches = events
    .map(e => ({ ...e, score: Math.max(matchScore(toks, e._searchText), matchScore(tok(e._searchText), contact._searchText)) }))
    .filter(e => e.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasNode = nodeMatches.length > 0;
  const hasEvent = eventMatches.length > 0;
  let state;
  if (hasNode && hasEvent) state = 'FULLY_ENGAGED';
  else if (hasNode) state = 'NODE_LINKED';
  else if (hasEvent) state = 'OPS_FLAGGED';
  else state = 'DORMANT';
  return { ...contact, state, nodeMatches, eventMatches };
}

const STATE_LABELS = {
  FULLY_ENGAGED: 'FULLY ENGAGED',
  NODE_LINKED: 'NODE-LINKED',
  OPS_FLAGGED: 'OPS-FLAGGED',
  DORMANT: 'DORMANT',
};

const SEV_COLOR = { critical: '#f87171', high: '#fb923c', warning: '#fbbf24', info: '#60a5fa', low: '#94a3b8' };

function ScoreBar({ score, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, width: '100%', overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export default function ContactGraphCentralityOpsTriple() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [events, setEvents] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [contactRes, nodeRes, opsRes] = await Promise.all([
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      const c = normaliseContacts(contactRes);
      const n = normaliseNodes(nodeRes);
      const e = normaliseEvents(opsRes);
      setContacts(c);
      setNodes(n);
      setEvents(e);
      setClassified(c.map(contact => classifyContact(contact, n, e)));
    } catch (err) {
      setError('Fetch failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) { setOpen(e.detail.open); return; }
      setOpen(v => !v);
    };
    window.addEventListener('jarvis:cgntoe-toggle', handler);
    return () => window.removeEventListener('jarvis:cgntoe-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      const q = (e.detail?.transcript || '').toLowerCase();
      if (CGNTOE_RE.test(q)) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_ENGAGED: classified.filter(c => c.state === 'FULLY_ENGAGED').length,
    NODE_LINKED: classified.filter(c => c.state === 'NODE_LINKED').length,
    OPS_FLAGGED: classified.filter(c => c.state === 'OPS_FLAGGED').length,
    DORMANT: classified.filter(c => c.state === 'DORMANT').length,
  };

  const visible = classified.filter(c => {
    if (filter !== 'ALL' && c.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c._searchText.toLowerCase().includes(q) || c.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `CGCOE Contact × Graph Centrality × Ops Event Triple Coverage: ${contacts.length} contacts cross-referenced against ${nodes.length} top-influence graph nodes and ${events.length} active ops events. Coverage: FULLY ENGAGED=${counts.FULLY_ENGAGED}, NODE-LINKED=${counts.NODE_LINKED}, OPS-FLAGGED=${counts.OPS_FLAGGED}, DORMANT=${counts.DORMANT}. In 2 sentences, assess which contacts have both network centrality linkage and operational event coverage versus those that are dormant with no network or operational presence, and identify the most critical contact surveillance and engagement gaps.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (err) {
      setAssessment('Assessment failed: ' + err.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const engagedPct = classified.length ? Math.round((counts.FULLY_ENGAGED / classified.length) * 100) : 0;
  const nodePct = classified.length ? Math.round((counts.NODE_LINKED / classified.length) * 100) : 0;
  const opsPct = classified.length ? Math.round((counts.OPS_FLAGGED / classified.length) * 100) : 0;
  const dormantPct = classified.length ? Math.round((counts.DORMANT / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 847600, bottom: 8, zIndex: 542,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #1a1a2e',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(20,20,60,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#f472b6', fontWeight: 700, fontSize: 13 }}>◈ CGCOE</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Contact × Graph Centrality × Ops Event Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#f472b6', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'CONTACTS', val: contacts.length, color: '#e2e8f0' },
          { label: 'GRAPH NODES', val: nodes.length, color: '#67e8f9' },
          { label: 'OPS EVENTS', val: events.length, color: '#fb923c' },
          { label: 'FULLY ENGAGED', val: counts.FULLY_ENGAGED, color: '#f472b6', badge: counts.FULLY_ENGAGED > 0 },
          { label: 'NODE-LINKED', val: counts.NODE_LINKED, color: '#67e8f9' },
          { label: 'OPS-FLAGGED', val: counts.OPS_FLAGGED, color: '#fb923c' },
          { label: 'DORMANT', val: counts.DORMANT, color: '#475569', badge: counts.DORMANT > 0 },
          { label: 'COVERAGE %', val: `${engagedPct}%`, color: '#f472b6' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
          <span>Contact Network & Operational Coverage</span>
          <span style={{ marginLeft: 'auto', color: '#f472b6' }}>{engagedPct}% fully engaged</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {engagedPct > 0 && <div style={{ width: `${engagedPct}%`, background: '#f472b6' }} />}
          {nodePct > 0 && <div style={{ width: `${nodePct}%`, background: '#67e8f9' }} />}
          {opsPct > 0 && <div style={{ width: `${opsPct}%`, background: '#fb923c' }} />}
          {dormantPct > 0 && <div style={{ width: `${dormantPct}%`, background: '#374151' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#f472b6' }}>● FULLY ENGAGED</span>
          <span style={{ color: '#67e8f9' }}>● NODE-LINKED</span>
          <span style={{ color: '#fb923c' }}>● OPS-FLAGGED</span>
          <span style={{ color: '#374151' }}>● DORMANT</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_ENGAGED', 'NODE_LINKED', 'OPS_FLAGGED', 'DORMANT'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#1a0a1a' : '#0f172a',
            border: `1px solid ${filter === f ? '#f472b6' : '#1e293b'}`,
            color: filter === f ? '#f9a8d4' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No contacts match current filter.</div>
        )}
        {visible.map(c => {
          const stateColor = c.state === 'FULLY_ENGAGED' ? '#f472b6' : c.state === 'NODE_LINKED' ? '#67e8f9' : c.state === 'OPS_FLAGGED' ? '#fb923c' : '#475569';
          const isExp = expanded === c.id;
          return (
            <div key={c.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#1a1a2e' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 140 }}>{STATE_LABELS[c.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{c.label}</span>
                {c.title && <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{c.title.slice(0, 16)}</span>}
                {c.company && <span style={{ background: '#0f1629', color: '#64748b', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{c.company.slice(0, 14)}</span>}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* Graph nodes pane */}
                    <div>
                      <div style={{ color: '#67e8f9', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>GRAPH NODES ({c.nodeMatches.length})</div>
                      {c.nodeMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No graph centrality node coverage</div>
                        : c.nodeMatches.slice(0, 6).map(n => (
                          <div key={n.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#a5f3fc', fontSize: 11 }}>{n.label.slice(0, 36)}{n.label.length > 36 ? '…' : ''}</span>
                              <div style={{ display: 'flex', gap: 3 }}>
                                {n.type && <span style={{ background: '#0c2833', color: '#67e8f9', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{n.type.slice(0, 12)}</span>}
                                {n.score > 0 && <span style={{ background: '#0f172a', color: '#475569', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{n.score.toFixed(2)}</span>}
                              </div>
                            </div>
                            <ScoreBar score={n.score} color="#67e8f9" />
                          </div>
                        ))
                      }
                    </div>
                    {/* Ops events pane */}
                    <div>
                      <div style={{ color: '#fb923c', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>OPS EVENTS ({c.eventMatches.length})</div>
                      {c.eventMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No ops event coverage</div>
                        : c.eventMatches.slice(0, 6).map(e => (
                          <div key={e.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#fed7aa', fontSize: 11 }}>{e.label.slice(0, 36)}{e.label.length > 36 ? '…' : ''}</span>
                              <div style={{ display: 'flex', gap: 3 }}>
                                {e.severity && <span style={{ background: '#1c0a00', color: SEV_COLOR[e.severity.toLowerCase()] || '#fb923c', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{e.severity.slice(0, 8).toUpperCase()}</span>}
                                {e.type && <span style={{ background: '#0f172a', color: '#64748b', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{e.type.slice(0, 10)}</span>}
                              </div>
                            </div>
                            <ScoreBar score={e.score} color="#fb923c" />
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assessment */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        {assessment && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessment}</div>}
        <button
          onClick={assess}
          disabled={assessing || classified.length === 0}
          style={{
            background: assessing ? '#1e293b' : '#1a0a1a', border: '1px solid #f472b6',
            color: assessing ? '#475569' : '#f9a8d4', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
