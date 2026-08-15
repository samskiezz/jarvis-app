import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const CGNTOE_RE = /\b(cgntoe|contact\s+graph\s+centrality\s+ops|contact\s+centrality\s+ops|contact\s+graph\s+ops|centrality\s+ops\s+contact|contact\s+node\s+ops|contact\s+high\s+influence\s+ops|contact\s+ops\s+centrality|fully\s+alarmed\s+contact\s+centrality|contact\s+centrality\s+event|contact\s+ops\s+node|graph\s+centrality\s+contact\s+ops|contact\s+network\s+ops)\b/i;
const THRESHOLD = 0.08;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fToks = tok(fieldText);
  const fSet = new Set(fToks);
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.contacts || raw.items || raw.data || []);
  return arr.map((c, i) => ({
    id: c.id || c.contact_id || `contact-${i}`,
    label: c.name || c.full_name || c.label || `Contact ${i + 1}`,
    email: c.email || '',
    company: c.company || c.organisation || c.organization || '',
    title: c.title || c.role || c.position || '',
    description: c.description || c.bio || c.notes || '',
    _searchText: [c.name, c.full_name, c.email, c.company, c.organisation, c.organization, c.title, c.role, c.position, c.description, c.bio, c.notes, c.tags].filter(Boolean).join(' '),
  }));
}

function normaliseNodes(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.nodes || raw.centrality || raw.items || raw.data || []);
  return arr.map((n, i) => ({
    id: n.id || n.node_id || `node-${i}`,
    label: n.label || n.name || n.title || `Node ${i + 1}`,
    type: n.type || n.kind || n.category || '',
    score: n.score || n.centrality_score || n.influence || 0,
    description: n.description || n.summary || '',
    _searchText: [n.label, n.name, n.title, n.type, n.kind, n.category, n.description, n.summary, n.tags].filter(Boolean).join(' '),
  }));
}

function normaliseOpsEvents(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.events || raw.ops_events || raw.items || raw.data || []);
  return arr.map((e, i) => ({
    id: e.id || e.event_id || `evt-${i}`,
    label: e.name || e.title || e.label || `Event ${i + 1}`,
    type: e.type || e.kind || e.category || '',
    severity: e.severity || e.priority || e.level || '',
    description: e.description || e.summary || e.message || '',
    _searchText: [e.name, e.title, e.label, e.type, e.kind, e.category, e.severity, e.priority, e.description, e.summary, e.message, e.tags].filter(Boolean).join(' '),
  }));
}

function correlate(contacts, nodes, opsEvents) {
  return contacts.map(contact => {
    const cToks = tok(contact._searchText);
    const matchedNodes = nodes
      .map(n => ({ ...n, score: matchScore(cToks, n._searchText) }))
      .filter(n => n.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedOps = opsEvents
      .map(e => ({ ...e, score: matchScore(cToks, e._searchText) }))
      .filter(e => e.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasNode = matchedNodes.length > 0;
    const hasOps = matchedOps.length > 0;
    let coverage;
    if (hasNode && hasOps) coverage = 'FULLY_ALARMED';
    else if (hasNode) coverage = 'NODE_LINKED';
    else if (hasOps) coverage = 'OPS_TRIGGERED';
    else coverage = 'CLEAR';
    return { ...contact, matchedNodes, matchedOps, coverage };
  });
}

export function isCgntoeQuery(t) {
  return CGNTOE_RE.test(t || '');
}

export async function buildCgntoeScript() {
  try {
    const [contactR, nodeR, opsR] = await Promise.all([
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : null),
    ]);
    const rows = correlate(normaliseContacts(contactR), normaliseNodes(nodeR), normaliseOpsEvents(opsR));
    const alarmed = rows.filter(r => r.coverage === 'FULLY_ALARMED').length;
    const clear = rows.filter(r => r.coverage === 'CLEAR').length;
    return `CGNTOE coverage: ${rows.length} contacts assessed against high-influence graph nodes and live ops events — ${alarmed} fully alarmed (both network centrality link and live operational trigger), ${clear} clear (no node or ops event overlap). ${alarmed > 0 ? `${alarmed} contact${alarmed > 1 ? 's have' : ' has'} simultaneous high-influence network presence and active operational event exposure — immediate prioritisation required.` : 'No contacts are simultaneously node-linked and ops-triggered at this time.'}`;
  } catch {
    return 'CGNTOE: contact graph centrality ops event coverage data unavailable.';
  }
}

const TABS = ['ALL', 'FULLY ALARMED', 'NODE LINKED', 'OPS TRIGGERED', 'CLEAR'];
const TAB_KEY = {
  'ALL': null,
  'FULLY ALARMED': 'FULLY_ALARMED',
  'NODE LINKED': 'NODE_LINKED',
  'OPS TRIGGERED': 'OPS_TRIGGERED',
  'CLEAR': 'CLEAR',
};

const COVER_COLOR = {
  FULLY_ALARMED: '#f59e0b',
  NODE_LINKED: '#06b6d4',
  OPS_TRIGGERED: '#f97316',
  CLEAR: '#64748b',
};

const LABEL_MAP = {
  FULLY_ALARMED: 'FULLY ALARMED',
  NODE_LINKED: 'NODE LINKED',
  OPS_TRIGGERED: 'OPS TRIGGERED',
  CLEAR: 'CLEAR',
};

export default function ContactGraphCentralityOpsTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [counts, setCounts] = useState({ total: 0, nodes: 0, opsEvents: 0, alarmed: 0, nodeLinked: 0, opsTriggered: 0, clear: 0 });
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [contactR, nodeR, opsR] = await Promise.all([
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : Promise.reject(`contacts ${r.status}`)),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : Promise.reject(`centrality ${r.status}`)),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : Promise.reject(`ops/events ${r.status}`)),
      ]);
      const contacts = normaliseContacts(contactR);
      const nodes = normaliseNodes(nodeR);
      const opsEvents = normaliseOpsEvents(opsR);
      const correlated = correlate(contacts, nodes, opsEvents);
      setRows(correlated);
      setCounts({
        total: correlated.length,
        nodes: nodes.length,
        opsEvents: opsEvents.length,
        alarmed: correlated.filter(r => r.coverage === 'FULLY_ALARMED').length,
        nodeLinked: correlated.filter(r => r.coverage === 'NODE_LINKED').length,
        opsTriggered: correlated.filter(r => r.coverage === 'OPS_TRIGGERED').length,
        clear: correlated.filter(r => r.coverage === 'CLEAR').length,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) setOpen(e.detail.open);
      else setOpen(v => !v);
    };
    window.addEventListener('jarvis:cgntoe-toggle', handler);
    return () => window.removeEventListener('jarvis:cgntoe-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const tabKey = TAB_KEY[tab];
    if (tabKey && r.coverage !== tabKey) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        r.label.toLowerCase().includes(s) ||
        r.email.toLowerCase().includes(s) ||
        r.company.toLowerCase().includes(s) ||
        r.title.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const total = counts.total || 1;
  const barAlarmed = (counts.alarmed / total * 100).toFixed(1);
  const barNode = (counts.nodeLinked / total * 100).toFixed(1);
  const barOps = (counts.opsTriggered / total * 100).toFixed(1);
  const barClear = (counts.clear / total * 100).toFixed(1);

  async function assess(row) {
    setAssessing(row.id);
    try {
      const prompt = `Analyse contact "${row.label}" (${row.title || 'no title'}${row.company ? ' at ' + row.company : ''}) for graph centrality node and ops event coverage. Coverage state: ${LABEL_MAP[row.coverage]}. Matched centrality nodes: ${row.matchedNodes.map(n => n.label).join(', ') || 'none'}. Matched ops events: ${row.matchedOps.map(e => e.label).join(', ') || 'none'}. ${row.coverage === 'FULLY_ALARMED' ? 'This contact is both high-influence network linked AND has live operational event exposure — assess the combined risk and recommend immediate action.' : row.coverage === 'CLEAR' ? 'This contact has no graph node or ops event coverage — assess whether this represents a genuine intelligence gap.' : 'Assess the coverage gap and recommend remediation.'} Respond in exactly 2 sentences.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.__JARVIS_KEY__ || 'dev-key'}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'Assessment unavailable.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      await fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch {
      /* silent */
    } finally {
      setAssessing(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 822960, bottom: 8, zIndex: 498,
          background: 'rgba(14,20,28,0.82)', border: '1px solid #374151',
          borderRadius: 6, padding: '3px 9px', cursor: 'pointer',
          fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(6px)',
        }}
        title="Contact × Graph Centrality × Ops Event Triple Coverage (CGNTOE)"
      >
        ◈ CGNTOE
        {counts.alarmed > 0 && (
          <span style={{
            background: '#f59e0b', color: '#0a0e14', borderRadius: 8,
            fontSize: 10, padding: '0 5px', fontWeight: 700, lineHeight: '16px',
          }}>{counts.alarmed}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 44, left: '50%', transform: 'translateX(-50%)',
      width: 900, maxHeight: '78vh', zIndex: 498,
      background: 'rgba(10,14,20,0.97)', border: '1px solid #1e293b',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
      fontFamily: 'monospace',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 13 }}>◈ CGNTOE</span>
        <span style={{ color: '#64748b', fontSize: 11, flex: 1 }}>Contact × Graph Centrality × Ops Event Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 10 }}>LOADING…</span>}
        <button onClick={load} style={{ background: 'none', border: '1px solid #374151', borderRadius: 4, color: '#64748b', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'CONTACTS', val: counts.total, color: '#94a3b8' },
          { label: 'CENTRALITY NODES', val: counts.nodes, color: '#06b6d4' },
          { label: 'OPS EVENTS', val: counts.opsEvents, color: '#f97316' },
          { label: 'FULLY ALARMED', val: counts.alarmed, color: '#f59e0b' },
          { label: 'NODE LINKED', val: counts.nodeLinked, color: '#06b6d4' },
          { label: 'OPS TRIGGERED', val: counts.opsTriggered, color: '#f97316' },
          { label: 'CLEAR', val: counts.clear, color: '#64748b' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(30,41,59,0.6)', borderRadius: 6, padding: '4px 10px',
            border: `1px solid ${s.color}33`,
          }}>
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ margin: '0 14px 8px', height: 6, borderRadius: 3, background: '#1e293b', display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: `${barAlarmed}%`, background: '#f59e0b', transition: 'width 0.4s' }} />
        <div style={{ width: `${barNode}%`, background: '#06b6d4', transition: 'width 0.4s' }} />
        <div style={{ width: `${barOps}%`, background: '#f97316', transition: 'width 0.4s' }} />
        <div style={{ width: `${barClear}%`, background: '#64748b', transition: 'width 0.4s' }} />
      </div>

      {error && (
        <div style={{ margin: '0 14px 6px', color: '#ef4444', fontSize: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 4, padding: '4px 8px' }}>
          {error}
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(245,158,11,0.15)' : 'rgba(30,41,59,0.4)',
            border: `1px solid ${tab === t ? '#f59e0b' : '#374151'}`,
            borderRadius: 4, color: tab === t ? '#f59e0b' : '#64748b',
            fontSize: 10, padding: '2px 8px', cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            marginLeft: 'auto', background: 'rgba(30,41,59,0.6)', border: '1px solid #374151',
            borderRadius: 4, color: '#cbd5e1', fontSize: 10, padding: '2px 8px', width: 160,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 24 }}>No contacts match current filter.</div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                background: 'rgba(30,41,59,0.5)', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${COVER_COLOR[row.coverage]}33`,
              }}
            >
              <span style={{ color: COVER_COLOR[row.coverage], fontSize: 10, fontWeight: 700, minWidth: 120 }}>
                {LABEL_MAP[row.coverage]}
              </span>
              <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1 }}>{row.label}</span>
              {row.company && (
                <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(71,85,105,0.3)', borderRadius: 3, padding: '1px 5px' }}>{row.company.slice(0, 20)}</span>
              )}
              <span style={{ color: '#64748b', fontSize: 9 }}>
                {row.matchedNodes.length}nd {row.matchedOps.length}ops
              </span>
              <span style={{ color: '#64748b', fontSize: 11 }}>{expanded === row.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.id && (
              <div style={{ padding: '8px 8px 4px', background: 'rgba(15,23,42,0.6)', borderRadius: '0 0 6px 6px', border: '1px solid #1e293b', borderTop: 'none' }}>
                {(row.title || row.email) && (
                  <div style={{ color: '#64748b', fontSize: 10, marginBottom: 8 }}>
                    {row.title && <span>{row.title}</span>}
                    {row.title && row.email && <span style={{ margin: '0 6px' }}>·</span>}
                    {row.email && <span>{row.email}</span>}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* Centrality nodes */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#06b6d4', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>CENTRALITY NODES ({row.matchedNodes.length})</div>
                    {row.matchedNodes.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched centrality nodes.</div>
                      : row.matchedNodes.slice(0, 5).map(n => (
                        <div key={n.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(n.score * 400, 100)}%`, height: '100%', background: '#06b6d4' }} />
                            </div>
                            {n.type && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(6,182,212,0.1)', borderRadius: 3, padding: '1px 4px' }}>{n.type.slice(0, 16)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{n.label}</div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Ops events */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#f97316', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>OPS EVENTS ({row.matchedOps.length})</div>
                    {row.matchedOps.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched ops events.</div>
                      : row.matchedOps.slice(0, 5).map(e => (
                        <div key={e.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(e.score * 400, 100)}%`, height: '100%', background: '#f97316' }} />
                            </div>
                            {e.severity && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(249,115,22,0.1)', borderRadius: 3, padding: '1px 4px' }}>{e.severity.slice(0, 12)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{e.label}</div>
                        </div>
                      ))
                    }
                  </div>
                </div>
                <button
                  onClick={() => assess(row)}
                  disabled={assessing === row.id}
                  style={{
                    marginTop: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid #f59e0b44',
                    borderRadius: 4, color: '#f59e0b', fontSize: 10, padding: '3px 10px', cursor: 'pointer',
                    opacity: assessing === row.id ? 0.5 : 1,
                  }}
                >
                  {assessing === row.id ? 'ASSESSING…' : '⬡ ASSESS'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
