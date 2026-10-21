/**
 * GraphTaskKnowledgeContactNexus — F98
 *
 * Fetches /v1/graph/centrality + /entities/Task + /knowledge/ + /entities/Contact.
 *
 * Keyword-matches each graph node (label/type) against tasks, knowledge articles,
 * AND contacts to classify:
 *   ANCHORED   — node matches a task + knowledge article + contact (fully grounded)
 *   ACTIVE     — node matches a task + contact but no knowledge (operationally live, undocumented)
 *   DOCUMENTED — node matches a knowledge article but no task or contact (known but dormant)
 *   GHOST      — no match to any task, knowledge, or contact (blind-spot node)
 *
 * Toggle: ◈ MXNEX button (fixed, bottom strip) left:103240, zIndex:195
 * Stat tiles: nodes / tasks / knowledge / contacts / anchored / active / documented / ghost
 * Red pulse on GHOST count (untracked blind-spot nodes — zero operational footprint).
 * Expandable rows: matched tasks with status badge + matched knowledge with category badge
 *                  + matched contacts with role/org badge.
 * Filter tabs: ALL / ANCHORED / ACTIVE / DOCUMENTED / GHOST + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "mxnex"/"graph task knowledge contact"/"mission nexus"/"graph nexus"
 *        "node mission"/"graph mission"/"quad nexus"/"node grounding"
 *        "mission intelligence nexus"/"graph ghost"/"ghost nodes"/"node anchor"
 *        "contact task knowledge graph"/"intelligence nexus"
 * Event: jarvis:mxnex-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ANCHORED', 'ACTIVE', 'DOCUMENTED', 'GHOST'];

const CLS_COLOR = {
  ANCHORED:   '#22C55E',
  ACTIVE:     '#F97316',
  DOCUMENTED: '#38BDF8',
  GHOST:      '#EF4444',
};

const STATUS_COLOR = {
  active: '#22C55E', running: '#22C55E', complete: '#38BDF8', completed: '#38BDF8',
  pending: '#F59E0B', draft: '#94A3B8', failed: '#EF4444', open: '#F97316',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeGraph(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.nodes)) return raw.nodes;
  if (Array.isArray(raw.graph?.nodes)) return raw.graph.nodes;
  if (Array.isArray(raw.entities)) return raw.entities;
  if (Array.isArray(raw.top_entities)) return raw.top_entities;
  if (raw.node_count != null) {
    const labels = raw.labels || raw.node_labels || [];
    if (labels.length) return labels.map(l => ({ label: l, type: l }));
    return [{ label: 'Brain', type: 'brain', count: raw.node_count }];
  }
  return [];
}

function normalizeList(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.entities)) return raw.entities;
  return [];
}

export function isMxnexQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'mxnex', 'graph task knowledge contact', 'mission nexus', 'graph nexus',
    'node mission', 'graph mission', 'quad nexus', 'node grounding',
    'mission intelligence nexus', 'graph ghost', 'ghost nodes', 'node anchor',
    'contact task knowledge graph', 'intelligence nexus',
  ].some(k => s.includes(k));
}

export function buildMxnexScript() {
  return (
    'Fetch /v1/graph/centrality, /entities/Task, /knowledge/, and /entities/Contact. ' +
    'Keyword-match each graph node label/type against task names/descriptions, ' +
    'knowledge article titles/content, AND contact names/roles/organisations. ' +
    'Classify each node as ANCHORED (task + knowledge + contact), ACTIVE (task + contact, no knowledge), ' +
    'DOCUMENTED (knowledge only), or GHOST (no match to any source — blind-spot node). ' +
    'Report total GHOST count, identify which GHOST nodes carry the highest centrality score (highest-risk blind spots), ' +
    'and recommend which tasks, knowledge articles, or contacts should be created to ground them.'
  );
}

export default function GraphTaskKnowledgeContactNexus() {
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
    nodes: 0, tasks: 0, knowledge: 0, contacts: 0,
    anchored: 0, active: 0, documented: 0, ghost: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      const [graphRaw, tasksRaw, knowledgeRaw, contactsRaw] = await Promise.all([
        fetch(`${API}/v1/graph/centrality`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Task`,       { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/knowledge/`,          { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Contact`,    { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const nodes    = normalizeGraph(graphRaw);
      const tasks    = normalizeList(tasksRaw);
      const articles = normalizeList(knowledgeRaw);
      const contacts = normalizeList(contactsRaw);

      const built = nodes.map((node, idx) => {
        const nodeText = [node.label, node.type, node.name, node.description, node.category]
          .filter(Boolean).join(' ');
        const nToks = tokens(nodeText);

        const matchedTasks = tasks.filter(t => {
          const s = [t.title, t.name, t.description, t.type, t.status, t.tags?.join?.(' ')]
            .filter(Boolean).join(' ');
          return overlaps(nToks, s);
        });

        const matchedKnowledge = articles.filter(a => {
          const s = [a.title, a.name, a.content, a.summary, a.category, a.tags?.join?.(' ')]
            .filter(Boolean).join(' ');
          return overlaps(nToks, s);
        });

        const matchedContacts = contacts.filter(c => {
          const s = [c.name, c.full_name, c.role, c.organisation, c.org, c.description, c.category]
            .filter(Boolean).join(' ');
          return overlaps(nToks, s);
        });

        const hasTask      = matchedTasks.length > 0;
        const hasKnowledge = matchedKnowledge.length > 0;
        const hasContact   = matchedContacts.length > 0;

        let cls;
        if (hasTask && hasKnowledge && hasContact)    cls = 'ANCHORED';
        else if (hasTask && hasContact)               cls = 'ACTIVE';
        else if (hasKnowledge)                        cls = 'DOCUMENTED';
        else                                          cls = 'GHOST';

        return {
          id:               `node-${idx}`,
          label:            node.label || node.name || node.type || `Node ${idx + 1}`,
          type:             node.type || node.category || '',
          centrality:       node.centrality ?? node.score ?? node.weight ?? null,
          cls,
          matchedTasks,
          matchedKnowledge,
          matchedContacts,
        };
      });

      const anchored   = built.filter(r => r.cls === 'ANCHORED').length;
      const active     = built.filter(r => r.cls === 'ACTIVE').length;
      const documented = built.filter(r => r.cls === 'DOCUMENTED').length;
      const ghost      = built.filter(r => r.cls === 'GHOST').length;

      setRows(built);
      setCounts({
        nodes: built.length, tasks: tasks.length, knowledge: articles.length,
        contacts: contacts.length, anchored, active, documented, ghost,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:mxnex-toggle', handler);
    return () => window.removeEventListener('jarvis:mxnex-toggle', handler);
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
        body:    JSON.stringify({ message: buildMxnexScript() }),
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
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#EF4444' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.label.toLowerCase().includes(s)
        || r.type.toLowerCase().includes(s)
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
          position: 'fixed', bottom: 8, left: 103240, zIndex: 195,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #EF4444',
          color: '#EF4444', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ MXNEX{counts.ghost > 0 ? <span style={pulse}> {counts.ghost}</span> : null}
      </button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 740, maxHeight: '80vh',
        background: 'rgba(5,10,20,0.97)', border: '1px solid #EF4444',
        borderRadius: 8, zIndex: 9500, overflowY: 'auto', fontFamily: 'monospace',
        boxShadow: '0 0 32px rgba(239,68,68,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 13 }}>
            ◈ GRAPH × TASK × KNOWLEDGE × CONTACT — MISSION INTELLIGENCE NEXUS
          </span>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'NODES',      val: counts.nodes,      col: '#94A3B8' },
            { label: 'TASKS',      val: counts.tasks,      col: '#94A3B8' },
            { label: 'KNOWLEDGE',  val: counts.knowledge,  col: '#94A3B8' },
            { label: 'CONTACTS',   val: counts.contacts,   col: '#94A3B8' },
            { label: 'ANCHORED',   val: counts.anchored,   col: CLS_COLOR.ANCHORED   },
            { label: 'ACTIVE',     val: counts.active,     col: CLS_COLOR.ACTIVE     },
            { label: 'DOCUMENTED', val: counts.documented, col: CLS_COLOR.DOCUMENTED },
            { label: 'GHOST',      val: counts.ghost,      col: CLS_COLOR.GHOST      },
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
            <div style={{ color: '#475569', fontSize: 12, padding: 8 }}>No nodes match.</div>
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
                {row.type && (
                  <span style={{
                    fontSize: 9, color: '#94A3B8', border: '1px solid #334155',
                    borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap',
                  }}>{row.type.toUpperCase()}</span>
                )}
                <span style={{
                  color: '#CBD5E1', fontSize: 12, flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {row.label}
                </span>
                {row.centrality != null && (
                  <span style={{ color: '#475569', fontSize: 10, whiteSpace: 'nowrap' }}>
                    {typeof row.centrality === 'number' ? row.centrality.toFixed(3) : row.centrality}
                  </span>
                )}
                <span style={{ color: '#475569', fontSize: 10 }}>{expanded[row.id] ? '▲' : '▼'}</span>
              </div>

              {expanded[row.id] && (
                <div style={{ paddingLeft: 12, paddingTop: 4 }}>
                  {row.matchedTasks.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: '#F97316', fontSize: 10, marginRight: 6 }}>Tasks:</span>
                      {row.matchedTasks.slice(0, 4).map((t, i) => {
                        const st  = (t.status || t.state || '').toLowerCase();
                        const col = STATUS_COLOR[st] || '#94A3B8';
                        return (
                          <span key={i} style={{
                            display: 'inline-block', marginRight: 4, marginBottom: 2,
                            background: `${col}18`, border: `1px solid ${col}`,
                            color: col, fontSize: 9, borderRadius: 3, padding: '1px 5px',
                          }}>
                            {t.title || t.name || 'Task'}
                            {st && <span style={{ opacity: 0.8, marginLeft: 4 }}>[{st.toUpperCase()}]</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedKnowledge.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: '#38BDF8', fontSize: 10, marginRight: 6 }}>Knowledge:</span>
                      {row.matchedKnowledge.slice(0, 4).map((a, i) => {
                        const cat = a.category || a.type || '';
                        return (
                          <span key={i} style={{
                            display: 'inline-block', marginRight: 4, marginBottom: 2,
                            background: 'rgba(56,189,248,0.1)', border: '1px solid #38BDF8',
                            color: '#38BDF8', fontSize: 9, borderRadius: 3, padding: '1px 5px',
                          }}>
                            {a.title || a.name || 'Article'}
                            {cat && <span style={{ opacity: 0.7, marginLeft: 4 }}>[{cat.toUpperCase()}]</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedContacts.length > 0 && (
                    <div>
                      <span style={{ color: '#A78BFA', fontSize: 10, marginRight: 6 }}>Contacts:</span>
                      {row.matchedContacts.slice(0, 4).map((c, i) => {
                        const org = c.organisation || c.org || c.company || '';
                        return (
                          <span key={i} style={{
                            display: 'inline-block', marginRight: 4, marginBottom: 2,
                            background: 'rgba(167,139,250,0.1)', border: '1px solid #A78BFA',
                            color: '#A78BFA', fontSize: 9, borderRadius: 3, padding: '1px 5px',
                          }}>
                            {c.name || c.full_name || 'Contact'}
                            {c.role && <span style={{ opacity: 0.7, marginLeft: 4 }}>[{c.role.toUpperCase()}]</span>}
                            {org && <span style={{ opacity: 0.6, marginLeft: 2 }}>@ {org}</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedTasks.length === 0 && row.matchedKnowledge.length === 0 && row.matchedContacts.length === 0 && (
                    <div style={{ color: '#475569', fontSize: 10 }}>No task, knowledge, or contact match — ghost node.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ASSESS */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(239,68,68,0.2)' }}>
          <button onClick={assess} disabled={assessing}
            style={{
              background: assessing ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.2)',
              border: '1px solid #EF4444', color: '#EF4444',
              padding: '4px 16px', fontSize: 11, borderRadius: 4,
              cursor: assessing ? 'default' : 'pointer', fontFamily: 'monospace',
            }}>
            {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
          </button>
          {assessment && (
            <div style={{
              marginTop: 8, padding: 8, background: 'rgba(239,68,68,0.05)',
              border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4,
              color: '#CBD5E1', fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}>{assessment}</div>
          )}
        </div>
      </div>
    </>
  );
}
