/**
 * TaskSkillBrainContactGraphFoundation — F217
 *
 * Fetches /entities/Task + /v1/aip/skill + /v1/cinematic/brain +
 *         /entities/Contact + /v1/graph/centrality
 *
 * Keyword-matches each task (name/title/description/tags) against
 * skill names/categories, brain node labels/types, contact names/roles/orgs,
 * and graph node labels/types to classify:
 *
 *   GROUNDED — task matches all 4 sources (skill + brain + contact + graph)
 *              (fully grounded mission: capable, modelled, owned, traced)
 *   CAPABLE  — task matches skill + brain + graph (3 sources, no contact)
 *              (capable mission with skills + model + graph trace, but no contact owner)
 *   STAFFED  — task matches at least 1 source but not GROUNDED/CAPABLE
 *              (partial mission grounding — some capability or staffing coverage)
 *   ADRIFT   — no match to any source
 *              (mission orphan — no skill coverage, no brain model, no contact owner,
 *               no graph trace — full operational dead end)
 *
 * Toggle: ◈ TSBCG button (fixed, bottom strip) left:169320, zIndex:313
 * Stat tiles: tasks / skills / brain-nodes / contacts / graph-nodes /
 *             grounded / capable / staffed / adrift
 * Red pulse on ADRIFT count (mission orphans).
 * Expandable rows: matched skills with score badge +
 *                  matched brain nodes with type badge +
 *                  matched contacts with role/org +
 *                  matched graph nodes with centrality score badge.
 * Filter tabs: ALL / GROUNDED / CAPABLE / STAFFED / ADRIFT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "tsbcg"/"task brain"/"mission capability"/"task skill brain"/
 *        "task contact brain"/"capability foundation"/"task graph"/
 *        "mission foundation"/"task capability"/"operational foundation"/
 *        "mission grounded"/"adrift tasks"
 * Event: jarvis:tsbcg-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'GROUNDED', 'CAPABLE', 'STAFFED', 'ADRIFT'];

const CLS_COLOR = {
  GROUNDED: '#22C55E',
  CAPABLE:  '#38BDF8',
  STAFFED:  '#F59E0B',
  ADRIFT:   '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))         return raw;
  if (Array.isArray(raw?.items))  return raw.items;
  if (Array.isArray(raw?.tasks))  return raw.tasks;
  if (Array.isArray(raw?.results))return raw.results;
  if (Array.isArray(raw?.data))   return raw.data;
  return [];
}

function normalizeSkills(raw) {
  if (Array.isArray(raw))          return raw;
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.skills))  return raw.skills;
  if (Array.isArray(raw?.results)) return raw.results;
  if (Array.isArray(raw?.data))    return raw.data;
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

function normalizeContacts(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.contacts))  return raw.contacts;
  if (Array.isArray(raw?.results))   return raw.results;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function normalizeGraph(raw) {
  if (!raw) return [];
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.nodes))     return raw.nodes;
  if (Array.isArray(raw?.entities))  return raw.entities;
  if (Array.isArray(raw?.centrality))return raw.centrality;
  if (Array.isArray(raw?.results))   return raw.results;
  return [];
}

export function isTsbcgQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'tsbcg', 'task brain', 'mission capability', 'task skill brain',
    'task contact brain', 'capability foundation', 'task graph',
    'mission foundation', 'task capability', 'operational foundation',
    'mission grounded', 'adrift tasks',
  ].some(k => s.includes(k));
}

export function buildTsbcgScript() {
  return (
    'Fetch /entities/Task, /v1/aip/skill, /v1/cinematic/brain, ' +
    '/entities/Contact, and /v1/graph/centrality. ' +
    'Keyword-match each task (name/title/description/tags) against ' +
    'skill names/categories, brain node labels/types, ' +
    'contact names/roles/orgs, and graph node labels/types. ' +
    'Classify each task as GROUNDED (matches all 4 sources — skill, brain model, ' +
    'contact owner, and graph trace — fully grounded mission), ' +
    'CAPABLE (matches skill + brain + graph — 3 sources, no contact owner), ' +
    'STAFFED (matches at least one source but not GROUNDED or CAPABLE), ' +
    'or ADRIFT (no match to any source — mission orphan: no skill coverage, ' +
    'no brain model, no contact owner, no graph trace). ' +
    'Report total ADRIFT count, identify which adrift tasks represent the highest ' +
    'operational risk (high-priority or overdue tasks with zero capability grounding), ' +
    'and recommend which skills should cover them, which brain nodes should model them, ' +
    'which contacts should own them, and which graph nodes should trace them ' +
    'to eliminate these mission blind spots.'
  );
}

export default function TaskSkillBrainContactGraphFoundation() {
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
    tasks: 0, skills: 0, brainNodes: 0, contacts: 0, graphNodes: 0,
    grounded: 0, capable: 0, staffed: 0, adrift: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      const [tasksRaw, skillsRaw, brainRaw, contactsRaw, graphRaw] = await Promise.all([
        fetch(`${API}/entities/Task`,          { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/aip/skill`,           { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/cinematic/brain`,     { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Contact`,       { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/graph/centrality`,    { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const tasks      = normalizeTasks(tasksRaw);
      const skills     = normalizeSkills(skillsRaw);
      const brainNodes = normalizeBrain(brainRaw);
      const contacts   = normalizeContacts(contactsRaw);
      const graphNodes = normalizeGraph(graphRaw);

      const built = tasks.map((task, idx) => {
        const taskText = [
          task.name, task.title, task.description, task.type,
          task.category, task.subject, task.tags?.join?.(' '),
        ].filter(Boolean).join(' ');
        const tToks = tokens(taskText);

        const matchedSkills = skills.filter(s => {
          const str = [s.name, s.title, s.category, s.description, s.domain]
            .filter(Boolean).join(' ');
          return overlaps(tToks, str);
        });

        const matchedBrain = brainNodes.filter(n => {
          const str = [n.label, n.name, n.type, n.category, n.description]
            .filter(Boolean).join(' ');
          return overlaps(tToks, str);
        });

        const matchedContacts = contacts.filter(c => {
          const str = [
            c.name, c.title, c.role, c.org, c.organisation, c.organization,
            c.department, c.domain, c.tags?.join?.(' '), c.description,
          ].filter(Boolean).join(' ');
          return overlaps(tToks, str);
        });

        const matchedGraph = graphNodes.filter(n => {
          const str = [n.label, n.name, n.type, n.category, n.entity, n.id]
            .filter(Boolean).join(' ');
          return overlaps(tToks, str);
        });

        const hasSkill   = matchedSkills.length > 0;
        const hasBrain   = matchedBrain.length > 0;
        const hasContact = matchedContacts.length > 0;
        const hasGraph   = matchedGraph.length > 0;
        const matchCnt   = [hasSkill, hasBrain, hasContact, hasGraph].filter(Boolean).length;

        let cls;
        if (hasSkill && hasBrain && hasContact && hasGraph) cls = 'GROUNDED';
        else if (hasSkill && hasBrain && hasGraph)           cls = 'CAPABLE';
        else if (matchCnt >= 1)                              cls = 'STAFFED';
        else                                                 cls = 'ADRIFT';

        return {
          id: task.id || task._id || `task-${idx}`,
          name: task.name || task.title || `task-${idx}`,
          status: task.status || task.state || '',
          priority: task.priority || task.urgency || '',
          cls,
          matchedSkills,
          matchedBrain,
          matchedContacts,
          matchedGraph,
        };
      });

      const grounded = built.filter(r => r.cls === 'GROUNDED').length;
      const capable  = built.filter(r => r.cls === 'CAPABLE').length;
      const staffed  = built.filter(r => r.cls === 'STAFFED').length;
      const adrift   = built.filter(r => r.cls === 'ADRIFT').length;

      setCounts({
        tasks: tasks.length,
        skills: skills.length,
        brainNodes: brainNodes.length,
        contacts: contacts.length,
        graphNodes: graphNodes.length,
        grounded, capable, staffed, adrift,
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:tsbcg-toggle', handler);
    return () => window.removeEventListener('jarvis:tsbcg-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const script = buildTsbcgScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || d.text || JSON.stringify(d);
      setAssessment(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch {}
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, []);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) ||
             r.status.toLowerCase().includes(q) ||
             r.priority.toLowerCase().includes(q);
    }
    return true;
  });

  const pulse = counts.adrift > 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Mission Capability Foundation"
        style={{
          position: 'fixed',
          bottom: 8,
          left: 169320,
          zIndex: 313,
          background: open ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${pulse ? '#EF4444' : 'rgba(239,68,68,0.4)'}`,
          color: pulse ? '#EF4444' : '#94A3B8',
          padding: '3px 9px',
          fontSize: 10,
          cursor: 'pointer',
          borderRadius: 4,
          fontFamily: 'monospace',
          boxShadow: pulse ? '0 0 6px rgba(239,68,68,0.5)' : 'none',
          animation: pulse ? 'tsbcg-pulse 1.6s ease-in-out infinite' : 'none',
        }}
      >
        ◈ TSBCG{counts.adrift > 0 ? ` (${counts.adrift})` : ''}
      </button>

      <style>{`
        @keyframes tsbcg-pulse {
          0%, 100% { box-shadow: 0 0 4px rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 12px rgba(239,68,68,0.8); }
        }
      `}</style>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 36,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 680,
          maxHeight: '72vh',
          background: 'rgba(10,15,28,0.97)',
          border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: 8,
          zIndex: 9900,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'monospace',
          boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid rgba(239,68,68,0.2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 12 }}>
                ◈ MISSION CAPABILITY FOUNDATION
              </span>
              <span style={{ color: '#475569', fontSize: 10, marginLeft: 10 }}>
                Task × Skill × Brain × Contact × Graph
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 16 }}
            >×</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {[
              { label: 'TASKS',    val: counts.tasks,      color: '#94A3B8' },
              { label: 'SKILLS',   val: counts.skills,     color: '#94A3B8' },
              { label: 'BRAIN',    val: counts.brainNodes, color: '#94A3B8' },
              { label: 'CONTACTS', val: counts.contacts,   color: '#94A3B8' },
              { label: 'GRAPH',    val: counts.graphNodes, color: '#94A3B8' },
              { label: 'GROUNDED', val: counts.grounded,   color: CLS_COLOR.GROUNDED },
              { label: 'CAPABLE',  val: counts.capable,    color: CLS_COLOR.CAPABLE },
              { label: 'STAFFED',  val: counts.staffed,    color: CLS_COLOR.STAFFED },
              { label: 'ADRIFT',   val: counts.adrift,     color: CLS_COLOR.ADRIFT },
            ].map(t => (
              <div key={t.label} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 4,
                padding: '4px 8px',
                textAlign: 'center',
                flex: 1,
              }}>
                <div style={{ color: t.color, fontSize: 13, fontWeight: 700 }}>{t.val}</div>
                <div style={{ color: '#475569', fontSize: 8 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', gap: 4, padding: '6px 14px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CLS_COLOR[t] || 'rgba(148,163,184,0.2)'}22` : 'transparent',
                border: `1px solid ${tab === t ? (CLS_COLOR[t] || '#94A3B8') : 'rgba(255,255,255,0.08)'}`,
                color: tab === t ? (CLS_COLOR[t] || '#94A3B8') : '#64748B',
                padding: '2px 10px', fontSize: 10, cursor: 'pointer', borderRadius: 3, fontFamily: 'monospace',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)', color: '#CBD5E1',
                padding: '2px 8px', fontSize: 10, borderRadius: 3, fontFamily: 'monospace', width: 160,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            {loading && (
              <div style={{ color: '#475569', fontSize: 11, padding: 16, textAlign: 'center' }}>
                Loading mission capability data…
              </div>
            )}
            {error && (
              <div style={{ color: '#EF4444', fontSize: 11, padding: 16, textAlign: 'center' }}>
                {error}
              </div>
            )}

            {visible.map((row) => (
              <div key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {/* Row header */}
                <div
                  onClick={() => setExpanded(e => ({ ...e, [row.id]: !e[row.id] }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 14px', cursor: 'pointer',
                    background: expanded[row.id] ? 'rgba(255,255,255,0.03)' : 'transparent',
                  }}
                >
                  <span style={{
                    color: CLS_COLOR[row.cls], fontSize: 10, fontWeight: 700,
                    minWidth: 72, letterSpacing: 1,
                  }}>{row.cls}</span>
                  <span style={{ color: '#CBD5E1', fontSize: 11, flex: 1 }}>{row.name}</span>
                  {row.status && (
                    <span style={{
                      color: '#64748B', fontSize: 9,
                      background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 6px',
                    }}>{row.status}</span>
                  )}
                  {row.priority && (
                    <span style={{
                      color: '#94A3B8', fontSize: 9,
                      background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 6px',
                    }}>{row.priority}</span>
                  )}
                  <span style={{ color: '#334155', fontSize: 10 }}>{expanded[row.id] ? '▲' : '▼'}</span>
                </div>

                {/* Expanded detail */}
                {expanded[row.id] && (
                  <div style={{
                    padding: '8px 14px 10px 28px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    {/* Skills */}
                    {row.matchedSkills.length > 0 && (
                      <div>
                        <div style={{ color: '#22C55E', fontSize: 10, marginBottom: 3 }}>SKILLS ({row.matchedSkills.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row.matchedSkills.slice(0, 6).map((s, i) => {
                            const score = s.score !== undefined ? s.score : s.level;
                            return (
                              <span key={i} style={{
                                background: 'rgba(34,197,94,0.1)', color: '#22C55E',
                                borderRadius: 3, padding: '1px 7px', fontSize: 10,
                              }}>
                                {s.name || s.title || `skill-${i}`}
                                {score !== undefined && score !== null && (
                                  <span style={{ color: '#64748B', marginLeft: 4 }}>{score}</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Brain nodes */}
                    {row.matchedBrain.length > 0 && (
                      <div>
                        <div style={{ color: '#38BDF8', fontSize: 10, marginBottom: 3 }}>BRAIN NODES ({row.matchedBrain.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row.matchedBrain.slice(0, 6).map((n, i) => {
                            const tp = n.type || n.category || '';
                            return (
                              <span key={i} style={{
                                background: 'rgba(56,189,248,0.1)', color: '#38BDF8',
                                borderRadius: 3, padding: '1px 7px', fontSize: 10,
                              }}>
                                {n.label || n.name || `node-${i}`}
                                {tp && <span style={{ color: '#64748B', marginLeft: 4 }}>{tp}</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Contacts */}
                    {row.matchedContacts.length > 0 && (
                      <div>
                        <div style={{ color: '#F59E0B', fontSize: 10, marginBottom: 3 }}>CONTACTS ({row.matchedContacts.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row.matchedContacts.slice(0, 6).map((c, i) => {
                            const role = c.role || c.title || '';
                            const org  = c.org || c.organisation || c.organization || '';
                            return (
                              <span key={i} style={{
                                background: 'rgba(245,158,11,0.1)', color: '#F59E0B',
                                borderRadius: 3, padding: '1px 7px', fontSize: 10,
                              }}>
                                {c.name || `contact-${i}`}
                                {(role || org) && (
                                  <span style={{ color: '#64748B', marginLeft: 4 }}>
                                    {[role, org].filter(Boolean).join(' · ')}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Graph nodes */}
                    {row.matchedGraph.length > 0 && (
                      <div>
                        <div style={{ color: '#A78BFA', fontSize: 10, marginBottom: 3 }}>GRAPH NODES ({row.matchedGraph.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row.matchedGraph.slice(0, 6).map((n, i) => {
                            const score = n.centrality !== undefined ? n.centrality
                                        : n.score !== undefined ? n.score
                                        : null;
                            return (
                              <span key={i} style={{
                                background: 'rgba(167,139,250,0.1)', color: '#A78BFA',
                                borderRadius: 3, padding: '1px 7px', fontSize: 10,
                              }}>
                                {n.label || n.name || n.entity || `node-${i}`}
                                {score !== null && (
                                  <span style={{ color: '#64748B', marginLeft: 4 }}>
                                    {typeof score === 'number' ? score.toFixed(3) : score}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {row.matchedSkills.length === 0 && row.matchedBrain.length === 0 &&
                     row.matchedContacts.length === 0 && row.matchedGraph.length === 0 && (
                      <div style={{ color: '#475569', fontSize: 11 }}>No matches — task is fully adrift.</div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {!loading && !error && visible.length === 0 && (
              <div style={{ color: '#475569', fontSize: 12, padding: 16, textAlign: 'center' }}>
                No tasks match this filter.
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
              {assessing ? 'Assessing…' : '▶ ASSESS ADRIFT TASKS'}
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
      )}
    </>
  );
}
