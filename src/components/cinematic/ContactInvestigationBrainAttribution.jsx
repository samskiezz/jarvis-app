/**
 * ContactInvestigationBrainAttribution — F99
 *
 * Fetches /entities/Contact + /v1/investigations + /v1/cinematic/brain.
 *
 * Keyword-matches each contact (name/role/org/aliases) against open investigation
 * titles/descriptions AND brain node labels to classify:
 *   ATTRIBUTED — contact matches both an investigation AND a brain node (fully tracked)
 *   TRACED     — contact matches a brain node but no investigation (modeled, not investigated)
 *   TRACKED    — contact matches an investigation but no brain node (investigated, not modeled)
 *   GHOST      — no match to any investigation AND no brain node (unknown actor — blind spot)
 *
 * Toggle: ◈ CIBATT button (fixed, bottom strip) left:103800, zIndex:196
 * Stat tiles: contacts / investigations / nodes / attributed / traced / tracked / ghost
 * Amber pulse on GHOST count (unknown actors with zero coverage).
 * Expandable rows: matched investigations with status badge +
 *                  matched brain nodes with centrality score badge.
 * Filter tabs: ALL / ATTRIBUTED / TRACED / TRACKED / GHOST + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "cibatt"/"contact brain attribution"/"contact investigation brain"
 *        "ghost contacts"/"unknown actors"/"contact attribution"
 *        "contact brain"/"contact investigation attribution"/"actor brain"
 *        "contact brain investigation"/"actor attribution"/"contact ghost"
 * Event: jarvis:cibatt-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ATTRIBUTED', 'TRACED', 'TRACKED', 'GHOST'];

const CLS_COLOR = {
  ATTRIBUTED: '#22C55E',
  TRACED:     '#38BDF8',
  TRACKED:    '#F97316',
  GHOST:      '#F59E0B',
};

const STATUS_COLOR = {
  active: '#22C55E', open: '#22C55E', running: '#22C55E',
  closed: '#94A3B8', resolved: '#38BDF8', complete: '#38BDF8', completed: '#38BDF8',
  pending: '#F59E0B', draft: '#94A3B8', failed: '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.contacts)) return raw.contacts;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  if (Array.isArray(raw?.entities)) return raw.entities;
  return [];
}

function normalizeInvestigations(raw) {
  if (Array.isArray(raw))                    return raw;
  if (Array.isArray(raw?.items))             return raw.items;
  if (Array.isArray(raw?.investigations))    return raw.investigations;
  if (Array.isArray(raw?.results))           return raw.results;
  if (Array.isArray(raw?.data))              return raw.data;
  return [];
}

function normalizeBrain(raw) {
  if (!raw) return [];
  if (Array.isArray(raw))                  return raw;
  if (Array.isArray(raw.nodes))            return raw.nodes;
  if (Array.isArray(raw.graph?.nodes))     return raw.graph.nodes;
  if (Array.isArray(raw.entities))         return raw.entities;
  if (raw.node_count != null) {
    const labels = raw.labels || raw.node_labels || [];
    if (labels.length) return labels.map(l => ({ label: l, type: l }));
    return [{ label: 'Brain', type: 'brain', count: raw.node_count }];
  }
  return [];
}

export function isCibattQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'cibatt', 'contact brain attribution', 'contact investigation brain',
    'ghost contacts', 'unknown actors', 'contact attribution',
    'contact brain', 'contact investigation attribution', 'actor brain',
    'contact brain investigation', 'actor attribution', 'contact ghost',
  ].some(k => s.includes(k));
}

export function buildCibattScript() {
  return (
    'Fetch /entities/Contact, /v1/investigations, and /v1/cinematic/brain. ' +
    'Keyword-match each contact (name/role/org/aliases) against open investigation titles/descriptions AND brain node labels. ' +
    'Classify each contact as ATTRIBUTED (matches both investigation + brain node), TRACED (brain node only), TRACKED (investigation only), or GHOST (no match — unknown actor). ' +
    'Report total GHOST count (contacts with zero coverage across investigations and brain model), ' +
    'identify which GHOST contacts represent the highest intelligence risk (by role, org, or recency), ' +
    'and recommend which investigations should be opened or which brain nodes should be added to cover the blind spots.'
  );
}

export default function ContactInvestigationBrainAttribution() {
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
    contacts: 0, investigations: 0, nodes: 0,
    attributed: 0, traced: 0, tracked: 0, ghost: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      const [contactsRaw, investigationsRaw, brainRaw] = await Promise.all([
        fetch(`${API}/entities/Contact`,       { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/investigations`,      { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/cinematic/brain`,     { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const contacts       = normalizeContacts(contactsRaw);
      const investigations = normalizeInvestigations(investigationsRaw);
      const nodes          = normalizeBrain(brainRaw);

      const built = contacts.map((contact, idx) => {
        const contactText = [
          contact.name, contact.role, contact.title, contact.org, contact.organisation,
          contact.organization, contact.email, contact.aliases?.join?.(' '),
          contact.description, contact.category, contact.type,
        ].filter(Boolean).join(' ');
        const cToks = tokens(contactText);

        const matchedInvestigations = investigations.filter(inv => {
          const s = [inv.title, inv.name, inv.description, inv.summary, inv.category, inv.type, inv.tags?.join?.(' ')]
            .filter(Boolean).join(' ');
          return overlaps(cToks, s);
        });

        const matchedNodes = nodes.filter(node => {
          const s = [node.label, node.name, node.type, node.description, node.category]
            .filter(Boolean).join(' ');
          return overlaps(cToks, s);
        });

        const hasInv  = matchedInvestigations.length > 0;
        const hasNode = matchedNodes.length > 0;

        let cls;
        if (hasInv && hasNode) cls = 'ATTRIBUTED';
        else if (hasNode)      cls = 'TRACED';
        else if (hasInv)       cls = 'TRACKED';
        else                   cls = 'GHOST';

        return {
          id:                    `contact-${idx}`,
          label:                 contact.name || contact.email || `Contact ${idx + 1}`,
          role:                  contact.role || contact.title || '',
          org:                   contact.org || contact.organisation || contact.organization || '',
          cls,
          matchedInvestigations,
          matchedNodes,
        };
      });

      const attributed = built.filter(r => r.cls === 'ATTRIBUTED').length;
      const traced     = built.filter(r => r.cls === 'TRACED').length;
      const tracked    = built.filter(r => r.cls === 'TRACKED').length;
      const ghost      = built.filter(r => r.cls === 'GHOST').length;

      setRows(built);
      setCounts({
        contacts: built.length,
        investigations: investigations.length,
        nodes: nodes.length,
        attributed, traced, tracked, ghost,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:cibatt-toggle', handler);
    return () => window.removeEventListener('jarvis:cibatt-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: buildCibattScript() }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt.slice(0, 300) } }));
    } catch (e) {
      setAssessment(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, []);

  const pulse = counts.ghost > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#F59E0B' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.label.toLowerCase().includes(s)
        || r.role.toLowerCase().includes(s)
        || r.org.toLowerCase().includes(s)
        || r.cls.toLowerCase().includes(s);
    }
    return true;
  });

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 103800, zIndex: 196,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #F59E0B',
          color: '#F59E0B', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ CIBATT{counts.ghost > 0 ? <span style={pulse}> {counts.ghost}</span> : null}
      </button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 700, maxHeight: '80vh',
        background: 'rgba(5,10,20,0.97)', border: '1px solid #F59E0B',
        borderRadius: 8, zIndex: 9500, overflowY: 'auto', fontFamily: 'monospace',
        boxShadow: '0 0 32px rgba(245,158,11,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid rgba(245,158,11,0.3)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#F59E0B', fontWeight: 700, fontSize: 13 }}>
            ◈ CONTACT × INVESTIGATION × BRAIN — THREAT ATTRIBUTION INTELLIGENCE
          </span>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'CONTACTS',       val: counts.contacts,       col: '#94A3B8' },
            { label: 'INVESTIGATIONS', val: counts.investigations,  col: '#94A3B8' },
            { label: 'BRAIN NODES',    val: counts.nodes,          col: '#94A3B8' },
            { label: 'ATTRIBUTED',     val: counts.attributed,     col: CLS_COLOR.ATTRIBUTED },
            { label: 'TRACED',         val: counts.traced,         col: CLS_COLOR.TRACED     },
            { label: 'TRACKED',        val: counts.tracked,        col: CLS_COLOR.TRACKED    },
            { label: 'GHOST',          val: counts.ghost,          col: CLS_COLOR.GHOST      },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${col}44`,
              borderRadius: 4, padding: '4px 10px', textAlign: 'center', minWidth: 80,
            }}>
              <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
              <div style={{ color: '#64748B', fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? CLS_COLOR[t] || '#334155' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${CLS_COLOR[t] || '#334155'}`,
                color: tab === t ? '#000' : CLS_COLOR[t] || '#94A3B8',
                padding: '2px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer',
              }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid #334155',
              color: '#E2E8F0', padding: '2px 8px', fontSize: 11, borderRadius: 3,
              outline: 'none', flex: 1, minWidth: 120,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ padding: '0 14px 8px' }}>
          {loading && <div style={{ color: '#64748B', fontSize: 12, padding: 8 }}>Loading…</div>}
          {error   && <div style={{ color: '#EF4444', fontSize: 12, padding: 8 }}>Error: {error}</div>}
          {!loading && visible.length === 0 && (
            <div style={{ color: '#475569', fontSize: 12, padding: 8 }}>No contacts match.</div>
          )}
          {visible.map(row => (
            <div key={row.id} style={{
              borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6, marginBottom: 6,
            }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => toggleExpand(row.id)}
              >
                <span style={{
                  fontSize: 9, fontWeight: 700, color: CLS_COLOR[row.cls],
                  border: `1px solid ${CLS_COLOR[row.cls]}`, borderRadius: 3,
                  padding: '1px 5px', whiteSpace: 'nowrap',
                }}>{row.cls}</span>
                {row.role && (
                  <span style={{
                    fontSize: 9, color: '#94A3B8', border: '1px solid #334155',
                    borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap',
                  }}>{row.role.toUpperCase()}</span>
                )}
                <span style={{ color: '#CBD5E1', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.label}
                </span>
                {row.org && (
                  <span style={{ color: '#475569', fontSize: 10, whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.org}
                  </span>
                )}
                <span style={{ color: '#475569', fontSize: 10 }}>{expanded[row.id] ? '▲' : '▼'}</span>
              </div>

              {expanded[row.id] && (
                <div style={{ paddingLeft: 12, paddingTop: 4 }}>
                  {row.matchedInvestigations.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: '#38BDF8', fontSize: 10, marginRight: 6 }}>Investigations:</span>
                      {row.matchedInvestigations.slice(0, 5).map((inv, i) => {
                        const st  = (inv.status || inv.state || '').toLowerCase();
                        const col = STATUS_COLOR[st] || '#94A3B8';
                        return (
                          <span key={i} style={{
                            display: 'inline-block', marginRight: 4, marginBottom: 2,
                            background: `${col}18`, border: `1px solid ${col}`,
                            color: col, fontSize: 9, borderRadius: 3, padding: '1px 5px',
                          }}>
                            {inv.title || inv.name || 'Investigation'}
                            {st && <span style={{ opacity: 0.8, marginLeft: 4 }}>[{st.toUpperCase()}]</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedNodes.length > 0 && (
                    <div>
                      <span style={{ color: '#A78BFA', fontSize: 10, marginRight: 6 }}>Brain nodes:</span>
                      {row.matchedNodes.slice(0, 5).map((node, i) => {
                        const score = node.centrality ?? node.score ?? node.weight ?? null;
                        return (
                          <span key={i} style={{
                            display: 'inline-block', marginRight: 4, marginBottom: 2,
                            background: 'rgba(167,139,250,0.1)', border: '1px solid #A78BFA',
                            color: '#A78BFA', fontSize: 9, borderRadius: 3, padding: '1px 5px',
                          }}>
                            {node.label || node.name || node.type || 'Node'}
                            {score != null && (
                              <span style={{ opacity: 0.8, marginLeft: 4 }}>
                                [{typeof score === 'number' ? score.toFixed(3) : score}]
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedInvestigations.length === 0 && row.matchedNodes.length === 0 && (
                    <div style={{ color: '#475569', fontSize: 10 }}>No investigation or brain node match — ghost contact (unknown actor).</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ASSESS */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(245,158,11,0.2)' }}>
          <button onClick={assess} disabled={assessing}
            style={{
              background: assessing ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.2)',
              border: '1px solid #F59E0B', color: '#F59E0B',
              padding: '4px 16px', fontSize: 11, borderRadius: 4,
              cursor: assessing ? 'default' : 'pointer', fontFamily: 'monospace',
            }}>
            {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
          </button>
          {assessment && (
            <div style={{
              marginTop: 8, padding: 8, background: 'rgba(245,158,11,0.05)',
              border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4,
              color: '#CBD5E1', fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}>{assessment}</div>
          )}
        </div>
      </div>
    </>
  );
}
