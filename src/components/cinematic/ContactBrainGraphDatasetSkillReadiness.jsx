/**
 * ContactBrainGraphDatasetSkillReadiness — F215
 *
 * Fetches /entities/Contact + /v1/cinematic/brain + /v1/graph/centrality +
 *         /v1/datasets + /v1/aip/skill
 *
 * Keyword-matches each contact (name/role/org/email/tags) against
 * brain node labels/types, graph centrality node labels, dataset names,
 * and skill names/categories to classify:
 *
 *   READY    — contact matches brain + graph + dataset + skill (all 4 sources)
 *              (fully grounded operator: modelled, traced, data-linked, skilled)
 *   ACTIVE   — contact matches brain + graph + skill (3 sources, no dataset)
 *              (capable operator with a brain model, graph trace and skill but no dataset)
 *   PARTIAL  — contact matches at least 1 source but not READY/ACTIVE
 *              (some operational grounding — partial coverage)
 *   GHOST    — no match to any source
 *              (untethered operator — zero brain model, graph trace, dataset link, or skill)
 *
 * Toggle: ◈ PORI button (fixed, bottom strip) left:168200, zIndex:311
 * Stat tiles: contacts / brain-nodes / graph-nodes / datasets / skills /
 *             ready / active / partial / ghost
 * Red pulse on GHOST count (untethered operators).
 * Expandable rows: matched brain nodes with type badge +
 *                  matched graph nodes with centrality score badge +
 *                  matched datasets with row-count badge +
 *                  matched skills with score badge.
 * Filter tabs: ALL / READY / ACTIVE / PARTIAL / GHOST + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "pori"/"personnel readiness"/"contact readiness"/"ghost personnel"
 *        "untethered contact"/"personnel index"/"contact brain"/"contact skill"
 *        "ghost contacts"/"contact graph"/"contact dataset"/"readiness index"
 * Event: jarvis:pori-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'READY', 'ACTIVE', 'PARTIAL', 'GHOST'];

const CLS_COLOR = {
  READY:   '#22C55E',
  ACTIVE:  '#38BDF8',
  PARTIAL: '#F59E0B',
  GHOST:   '#EF4444',
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
  return [];
}

function normalizeBrain(raw) {
  if (!raw) return [];
  if (Array.isArray(raw?.nodes))    return raw.nodes;
  if (Array.isArray(raw?.entities)) return raw.entities;
  if (Array.isArray(raw))           return raw;
  if (raw?.nodes && typeof raw.nodes === 'object') {
    return Object.entries(raw.nodes).map(([k, v]) => ({
      label: k, ...(typeof v === 'object' ? v : { score: v }),
    }));
  }
  return [];
}

function normalizeGraph(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.nodes))    return raw.nodes;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normalizeDatasets(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.datasets))  return raw.datasets;
  if (Array.isArray(raw?.results))   return raw.results;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function normalizeSkills(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.skills))   return raw.skills;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

export function isPortQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'pori', 'personnel readiness', 'contact readiness', 'ghost personnel',
    'untethered contact', 'personnel index', 'contact brain', 'contact skill',
    'ghost contacts', 'contact graph', 'contact dataset', 'readiness index',
  ].some(k => s.includes(k));
}

export function buildPoriScript() {
  return (
    'Fetch /entities/Contact, /v1/cinematic/brain, /v1/graph/centrality, /v1/datasets, and /v1/aip/skill. ' +
    'Keyword-match each contact (name/role/org/email/tags) against ' +
    'brain node labels/types, graph centrality node labels/descriptions, ' +
    'dataset names/descriptions, and skill names/categories. ' +
    'Classify each contact as READY (matches brain + graph + dataset + skill — all 4 sources), ' +
    'ACTIVE (matches brain + graph + skill — 3 sources), ' +
    'PARTIAL (matches at least one source), ' +
    'or GHOST (no match to any source — fully untethered operator). ' +
    'Report total GHOST count, identify which ghost contacts represent the highest operational risk ' +
    '(key roles with zero intelligence grounding), and recommend which brain nodes should model them, ' +
    'which graph traces should link them, which datasets should reference them, and which skills should match them ' +
    'to activate these untethered personnel.'
  );
}

export default function ContactBrainGraphDatasetSkillReadiness() {
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
    contacts: 0, brainNodes: 0, graphNodes: 0, datasets: 0, skills: 0,
    ready: 0, active: 0, partial: 0, ghost: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      const [contactsRaw, brainRaw, graphRaw, datasetsRaw, skillsRaw] = await Promise.all([
        fetch(`${API}/entities/Contact`,          { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/cinematic/brain`,         { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/graph/centrality`,        { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/datasets`,                { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/aip/skill`,               { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const contacts   = normalizeContacts(contactsRaw);
      const brainNodes = normalizeBrain(brainRaw);
      const graphNodes = normalizeGraph(graphRaw);
      const datasets   = normalizeDatasets(datasetsRaw);
      const skills     = normalizeSkills(skillsRaw);

      const built = contacts.map((contact, idx) => {
        const contactText = [
          contact.name, contact.title, contact.role, contact.org,
          contact.organisation, contact.organization, contact.email,
          contact.department, contact.domain, contact.tags?.join?.(' '),
          contact.description, contact.bio,
        ].filter(Boolean).join(' ');
        const cToks = tokens(contactText);

        const matchedBrain = brainNodes.filter(n => {
          const s = [n.label, n.name, n.type, n.category, n.description]
            .filter(Boolean).join(' ');
          return overlaps(cToks, s);
        });

        const matchedGraph = graphNodes.filter(n => {
          const s = [n.label, n.name, n.type, n.description, n.entity_type, n.entityType]
            .filter(Boolean).join(' ');
          return overlaps(cToks, s);
        });

        const matchedDatasets = datasets.filter(ds => {
          const s = [
            ds.name, ds.title, ds.description, ds.type, ds.category,
            ds.source, ds.tags?.join?.(' '),
          ].filter(Boolean).join(' ');
          return overlaps(cToks, s);
        });

        const matchedSkills = skills.filter(sk => {
          const s = [
            sk.name, sk.title, sk.description, sk.category, sk.domain,
            sk.type, sk.tags?.join?.(' '),
          ].filter(Boolean).join(' ');
          return overlaps(cToks, s);
        });

        const hasBrain   = matchedBrain.length > 0;
        const hasGraph   = matchedGraph.length > 0;
        const hasDataset = matchedDatasets.length > 0;
        const hasSkill   = matchedSkills.length > 0;

        let cls;
        if (hasBrain && hasGraph && hasDataset && hasSkill) {
          cls = 'READY';
        } else if (hasBrain && hasGraph && hasSkill) {
          cls = 'ACTIVE';
        } else if (hasBrain || hasGraph || hasDataset || hasSkill) {
          cls = 'PARTIAL';
        } else {
          cls = 'GHOST';
        }

        return {
          id:             `contact-${idx}`,
          label:          contact.name || contact.title || `Contact ${idx + 1}`,
          role:           contact.role || contact.title || contact.position || '',
          org:            contact.org || contact.organisation || contact.organization || '',
          cls,
          matchedBrain,
          matchedGraph,
          matchedDatasets,
          matchedSkills,
        };
      });

      const ready   = built.filter(r => r.cls === 'READY').length;
      const active  = built.filter(r => r.cls === 'ACTIVE').length;
      const partial = built.filter(r => r.cls === 'PARTIAL').length;
      const ghost   = built.filter(r => r.cls === 'GHOST').length;

      setRows(built);
      setCounts({
        contacts:   built.length,
        brainNodes: brainNodes.length,
        graphNodes: graphNodes.length,
        datasets:   datasets.length,
        skills:     skills.length,
        ready, active, partial, ghost,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:pori-toggle', handler);
    return () => window.removeEventListener('jarvis:pori-toggle', handler);
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
        body:    JSON.stringify({ message: buildPoriScript() }),
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
          position: 'fixed', bottom: 8, left: 168200, zIndex: 311,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #EF4444',
          color: '#EF4444', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ PORI{counts.ghost > 0 ? <span style={pulse}> {counts.ghost}</span> : null}
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
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(239,68,68,0.07)',
        }}>
          <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 13 }}>
            ◈ PORI — Personnel Operational Readiness Index
          </span>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
          {[
            { label: 'CONTACTS',    val: counts.contacts,   c: '#94A3B8' },
            { label: 'BRAIN NODES', val: counts.brainNodes, c: '#94A3B8' },
            { label: 'GRAPH NODES', val: counts.graphNodes, c: '#94A3B8' },
            { label: 'DATASETS',    val: counts.datasets,   c: '#94A3B8' },
            { label: 'SKILLS',      val: counts.skills,     c: '#94A3B8' },
            { label: 'READY',       val: counts.ready,      c: CLS_COLOR.READY   },
            { label: 'ACTIVE',      val: counts.active,     c: CLS_COLOR.ACTIVE  },
            { label: 'PARTIAL',     val: counts.partial,    c: CLS_COLOR.PARTIAL },
            { label: 'GHOST',       val: counts.ghost,      c: CLS_COLOR.GHOST   },
          ].map(({ label, val, c }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${c}44`,
              borderRadius: 4, padding: '4px 10px', textAlign: 'center', minWidth: 76,
            }}>
              <div style={{ color: c, fontSize: 16, fontWeight: 700 }}>{val}</div>
              <div style={{ color: '#64748B', fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? CLS_COLOR[t] || '#334155' : 'rgba(255,255,255,0.05)',
              border: 'none', color: tab === t ? '#000' : '#94A3B8',
              borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4,
              color: '#E2E8F0', fontSize: 11, padding: '3px 8px', outline: 'none',
            }}
          />
        </div>

        {/* Body */}
        <div style={{ padding: '8px 14px' }}>
          {loading && <div style={{ color: '#64748B', fontSize: 12, padding: 12 }}>Loading…</div>}
          {error   && <div style={{ color: '#EF4444', fontSize: 12, padding: 12 }}>Error: {error}</div>}

          {!loading && !error && visible.map(row => (
            <div key={row.id} style={{
              borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 4,
            }}>
              <div
                onClick={() => toggleExpand(row.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px',
                  cursor: 'pointer', borderRadius: 4,
                  background: expanded[row.id] ? 'rgba(255,255,255,0.04)' : 'transparent',
                }}
              >
                <span style={{ color: CLS_COLOR[row.cls], fontSize: 10, minWidth: 56, fontWeight: 700 }}>{row.cls}</span>
                <span style={{ color: '#E2E8F0', fontSize: 12, flex: 1 }}>{row.label}</span>
                {row.role && (
                  <span style={{
                    background: 'rgba(56,189,248,0.15)', color: '#38BDF8',
                    borderRadius: 3, padding: '1px 6px', fontSize: 10,
                  }}>{row.role}</span>
                )}
                {row.org && (
                  <span style={{
                    background: 'rgba(100,116,139,0.2)', color: '#94A3B8',
                    borderRadius: 3, padding: '1px 6px', fontSize: 10,
                  }}>{row.org}</span>
                )}
                <span style={{ color: '#475569', fontSize: 11 }}>{expanded[row.id] ? '▲' : '▼'}</span>
              </div>

              {expanded[row.id] && (
                <div style={{ padding: '6px 12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Brain nodes */}
                  {row.matchedBrain.length > 0 && (
                    <div>
                      <div style={{ color: '#38BDF8', fontSize: 10, marginBottom: 3 }}>BRAIN NODES ({row.matchedBrain.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedBrain.slice(0, 8).map((n, i) => (
                          <span key={i} style={{
                            background: 'rgba(56,189,248,0.1)', color: '#38BDF8',
                            borderRadius: 3, padding: '1px 7px', fontSize: 10,
                          }}>
                            {n.label || n.name || `node-${i}`}
                            {n.type && <span style={{ color: '#64748B', marginLeft: 4 }}>{n.type}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Graph nodes */}
                  {row.matchedGraph.length > 0 && (
                    <div>
                      <div style={{ color: '#A78BFA', fontSize: 10, marginBottom: 3 }}>GRAPH NODES ({row.matchedGraph.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedGraph.slice(0, 8).map((n, i) => (
                          <span key={i} style={{
                            background: 'rgba(167,139,250,0.1)', color: '#A78BFA',
                            borderRadius: 3, padding: '1px 7px', fontSize: 10,
                          }}>
                            {n.label || n.name || `gnode-${i}`}
                            {(n.centrality !== undefined || n.score !== undefined) && (
                              <span style={{ color: '#64748B', marginLeft: 4 }}>
                                {Number(n.centrality ?? n.score ?? 0).toFixed(2)}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Datasets */}
                  {row.matchedDatasets.length > 0 && (
                    <div>
                      <div style={{ color: '#22C55E', fontSize: 10, marginBottom: 3 }}>DATASETS ({row.matchedDatasets.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedDatasets.slice(0, 6).map((ds, i) => {
                          const rows = ds.row_count ?? ds.rows ?? ds.count ?? ds.size ?? null;
                          return (
                            <span key={i} style={{
                              background: 'rgba(34,197,94,0.1)', color: '#22C55E',
                              borderRadius: 3, padding: '1px 7px', fontSize: 10,
                            }}>
                              {ds.name || ds.title || `dataset-${i}`}
                              {rows !== null && (
                                <span style={{ color: '#64748B', marginLeft: 4 }}>{rows.toLocaleString?.() ?? rows}</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Skills */}
                  {row.matchedSkills.length > 0 && (
                    <div>
                      <div style={{ color: '#F59E0B', fontSize: 10, marginBottom: 3 }}>SKILLS ({row.matchedSkills.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedSkills.slice(0, 6).map((sk, i) => {
                          const score = sk.score ?? sk.level ?? sk.rating ?? null;
                          return (
                            <span key={i} style={{
                              background: 'rgba(245,158,11,0.1)', color: '#F59E0B',
                              borderRadius: 3, padding: '1px 7px', fontSize: 10,
                            }}>
                              {sk.name || sk.title || `skill-${i}`}
                              {score !== null && (
                                <span style={{ color: '#64748B', marginLeft: 4 }}>
                                  {Number(score).toFixed ? Number(score).toFixed(1) : score}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {row.matchedBrain.length === 0 && row.matchedGraph.length === 0 &&
                   row.matchedDatasets.length === 0 && row.matchedSkills.length === 0 && (
                    <div style={{ color: '#475569', fontSize: 11 }}>No matches — contact is fully untethered.</div>
                  )}
                </div>
              )}
            </div>
          ))}

          {!loading && !error && visible.length === 0 && (
            <div style={{ color: '#475569', fontSize: 12, padding: 16, textAlign: 'center' }}>
              No contacts match this filter.
            </div>
          )}
        </div>

        {/* ASSESS footer */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(239,68,68,0.2)' }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: assessing ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.2)',
              border: '1px solid #EF4444', color: '#EF4444',
              padding: '5px 14px', fontSize: 11, cursor: assessing ? 'default' : 'pointer',
              borderRadius: 4, fontFamily: 'monospace',
            }}
          >
            {assessing ? 'Assessing…' : '▶ ASSESS GHOST PERSONNEL'}
          </button>
          {assessment && (
            <div style={{
              marginTop: 8, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5,
              background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '8px 10px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              {assessment}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
