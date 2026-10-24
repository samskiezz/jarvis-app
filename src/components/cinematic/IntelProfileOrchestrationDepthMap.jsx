/**
 * IntelProfileOrchestrationDepthMap — F169
 *
 * Fetches /entities/IntelProfile + /v1/scenario/list + /knowledge/ +
 *         /v1/graph/centrality + /entities/Task.
 *
 * Keyword-matches each intel profile (name/category/description/tags) against
 * scenario names/descriptions, knowledge article titles/categories,
 * graph node labels/types, and task titles/descriptions to classify:
 *
 *   ORCHESTRATED — profile matches a scenario AND a graph node AND a task
 *                  (fully operational: scripted, traced, and tasked)
 *   SCRIPTED     — profile matches scenario + at least one other source
 *                  (playbook exists but partially grounded)
 *   KNOWN        — profile matches knowledge or graph but NO scenario + NO task
 *                  (researched but not operationalised)
 *   DARK         — no match to any source (blind intelligence asset)
 *
 * Toggle: ◈ IOPDEP button (fixed, bottom strip) left:143000, zIndex:266
 * Stat tiles: profiles / scenarios / knowledge / nodes / tasks /
 *             orchestrated / scripted / known / dark
 * Red pulse on DARK count (blind intel profiles).
 * Expandable rows: matched scenarios with status badge +
 *                  matched knowledge articles with category badge +
 *                  matched graph nodes with centrality score badge +
 *                  matched tasks with status badge.
 * Filter tabs: ALL / ORCHESTRATED / SCRIPTED / KNOWN / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "iopdep"/"intel orchestration"/"intel depth map"/"dark intel"
 *        "intel profile orchestration"/"intel scenario task"/"intel graph"
 *        "orchestrated intel"/"intel blind spot"/"intel profile depth"
 *        "intelligence orchestration"/"profile dark"/"intel profile task"
 * Event: jarvis:iopdep-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ORCHESTRATED', 'SCRIPTED', 'KNOWN', 'DARK'];

const CLS_COLOR = {
  ORCHESTRATED: '#22C55E',
  SCRIPTED:     '#38BDF8',
  KNOWN:        '#F97316',
  DARK:         '#EF4444',
};

const SEV_COLOR = {
  critical: '#EF4444', high: '#F97316',
  medium: '#F59E0B', low: '#22C55E',
  info: '#38BDF8',
};

const STATUS_COLOR = {
  running: '#22C55E', active: '#22C55E', open: '#22C55E',
  pending: '#F59E0B', queued: '#F59E0B', scheduled: '#F59E0B',
  completed: '#38BDF8', done: '#38BDF8', closed: '#38BDF8',
  failed: '#EF4444', error: '#EF4444',
  idle: '#6B7280', stopped: '#6B7280',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

export function isIopdepQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'iopdep', 'intel orchestration', 'intel depth map', 'dark intel',
    'intel profile orchestration', 'intel scenario task', 'intel graph',
    'orchestrated intel', 'intel blind spot', 'intel profile depth',
    'intelligence orchestration', 'profile dark', 'intel profile task',
  ].some(k => s.includes(k));
}

export function buildIopdepScript() {
  return (
    'Fetch /entities/IntelProfile, /v1/scenario/list, /knowledge/, /v1/graph/centrality, and /entities/Task. ' +
    'Keyword-match each intel profile (name/category/description/tags) against ' +
    'scenario names/descriptions, knowledge article titles/categories, ' +
    'graph node labels/types, and task titles/descriptions. ' +
    'Classify each profile as ORCHESTRATED (matches scenario + graph node + task), ' +
    'SCRIPTED (matches scenario + at least one other source), ' +
    'KNOWN (matches knowledge or graph but no scenario and no task), ' +
    'or DARK (no match to any source — blind intelligence asset). ' +
    'Report total DARK count, identify the most critical dark profiles, ' +
    'recommend which scenarios should cover each dark profile, ' +
    'which graph nodes relate to its domain, and which tasks should be created ' +
    'to bring each dark profile into orchestrated status.'
  );
}

export default function IntelProfileOrchestrationDepthMap() {
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
    profiles: 0, scenarios: 0, knowledge: 0, nodes: 0, tasks: 0,
    orchestrated: 0, scripted: 0, known: 0, dark: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      const [profilesRaw, scenariosRaw, knowledgeRaw, graphRaw, tasksRaw] = await Promise.all([
        fetch(`${API}/entities/IntelProfile`,    { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/scenario/list`,         { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/knowledge/`,               { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/graph/centrality`,      { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Task`,            { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const profiles  = normalizeArray(profilesRaw,  ['items', 'profiles', 'results', 'data', 'entities']);
      const scenarios = normalizeArray(scenariosRaw,  ['items', 'scenarios', 'results', 'data', 'entities']);
      const knowledge = normalizeArray(knowledgeRaw,  ['items', 'articles', 'results', 'data', 'entities', 'documents']);
      const nodes     = normalizeArray(graphRaw,      ['nodes', 'items', 'results', 'data', 'entities', 'centrality']);
      const tasks     = normalizeArray(tasksRaw,      ['items', 'tasks', 'results', 'data', 'entities']);

      const built = profiles.map((prof, idx) => {
        const profText = [
          prof.name, prof.title, prof.category, prof.type, prof.description,
          prof.id, prof.tags?.join?.(' '), prof.aliases?.join?.(' '),
        ].filter(Boolean).join(' ');
        const pToks = tokens(profText);

        const matchedScenarios = scenarios.filter(s => {
          const st = [s.name, s.title, s.description, s.type, s.category,
                      s.tags?.join?.(' '), s.objective].filter(Boolean).join(' ');
          return overlaps(pToks, st);
        });

        const matchedKnowledge = knowledge.filter(k => {
          const kt = [k.title, k.name, k.category, k.type, k.description,
                      k.summary, k.tags?.join?.(' '), k.topic].filter(Boolean).join(' ');
          return overlaps(pToks, kt);
        });

        const matchedNodes = nodes.filter(n => {
          const nt = [n.label, n.name, n.type, n.description, n.id,
                      n.tags?.join?.(' '), n.category].filter(Boolean).join(' ');
          return overlaps(pToks, nt);
        });

        const matchedTasks = tasks.filter(t => {
          const tt = [t.title, t.name, t.description, t.type, t.category,
                      t.tags?.join?.(' '), t.assignee, t.project].filter(Boolean).join(' ');
          return overlaps(pToks, tt);
        });

        const hasScenario  = matchedScenarios.length > 0;
        const hasKnowledge = matchedKnowledge.length > 0;
        const hasNode      = matchedNodes.length > 0;
        const hasTask      = matchedTasks.length > 0;

        let cls;
        if (hasScenario && hasNode && hasTask) {
          cls = 'ORCHESTRATED';
        } else if (hasScenario && (hasKnowledge || hasNode || hasTask)) {
          cls = 'SCRIPTED';
        } else if (!hasScenario && !hasTask && (hasKnowledge || hasNode)) {
          cls = 'KNOWN';
        } else {
          cls = 'DARK';
        }

        return {
          id:               `prof-${idx}`,
          label:            prof.name || prof.title || `Profile ${idx + 1}`,
          category:         prof.category || prof.type || '',
          cls,
          matchedScenarios,
          matchedKnowledge,
          matchedNodes,
          matchedTasks,
        };
      });

      const orchestrated = built.filter(r => r.cls === 'ORCHESTRATED').length;
      const scripted     = built.filter(r => r.cls === 'SCRIPTED').length;
      const known        = built.filter(r => r.cls === 'KNOWN').length;
      const dark         = built.filter(r => r.cls === 'DARK').length;

      setRows(built);
      setCounts({
        profiles: built.length,
        scenarios: scenarios.length,
        knowledge: knowledge.length,
        nodes: nodes.length,
        tasks: tasks.length,
        orchestrated, scripted, known, dark,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:iopdep-toggle', handler);
    return () => window.removeEventListener('jarvis:iopdep-toggle', handler);
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
        body:    JSON.stringify({ message: buildIopdepScript() }),
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

  const pulse = counts.dark > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#EF4444' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.label.toLowerCase().includes(s)
        || r.category.toLowerCase().includes(s)
        || r.cls.toLowerCase().includes(s);
    }
    return true;
  });

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const TILE = (col) => ({
    background: 'rgba(0,0,0,0.5)', border: `1px solid ${col}`,
    borderRadius: 4, padding: '4px 8px', minWidth: 70, textAlign: 'center',
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 143000, zIndex: 266,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #EF4444',
          color: '#EF4444', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ IOPDEP{counts.dark > 0 ? <span style={pulse}> {counts.dark}</span> : null}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)',
      width: 860, maxHeight: '72vh', background: 'rgba(0,0,0,0.92)',
      border: '1px solid #EF4444', borderRadius: 8, zIndex: 9200,
      display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      color: '#E5E7EB', fontSize: 12,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid #374151',
        background: 'rgba(239,68,68,0.08)',
      }}>
        <span style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 13 }}>
          ◈ IOPDEP — IntelProfile × Scenario × Knowledge × Graph × Task Orchestration Depth
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: 'rgba(239,68,68,0.15)', border: '1px solid #EF4444',
              color: '#EF4444', padding: '2px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
            }}
          >
            {assessing ? '…' : '▶ ASSESS'}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'none', border: '1px solid #4B5563',
              color: '#9CA3AF', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
            }}
          >✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', flexWrap: 'wrap' }}>
        {[
          ['profiles',     counts.profiles,     '#9CA3AF'],
          ['scenarios',    counts.scenarios,    '#38BDF8'],
          ['knowledge',    counts.knowledge,    '#A78BFA'],
          ['nodes',        counts.nodes,        '#F59E0B'],
          ['tasks',        counts.tasks,        '#F97316'],
          ['orchestrated', counts.orchestrated, '#22C55E'],
          ['scripted',     counts.scripted,     '#38BDF8'],
          ['known',        counts.known,        '#F97316'],
          ['dark',         counts.dark,         '#EF4444'],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={TILE(col)}>
            <div style={{ color: col, fontWeight: 'bold', fontSize: 14 }}>{val}</div>
            <div style={{ color: '#9CA3AF', fontSize: 10 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 12px 6px', alignItems: 'center', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(239,68,68,0.2)' : 'rgba(0,0,0,0.4)',
            border: `1px solid ${tab === t ? '#EF4444' : '#374151'}`,
            color: tab === t ? '#EF4444' : '#9CA3AF',
            padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}>{t}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="filter…"
          style={{
            background: 'rgba(0,0,0,0.5)', border: '1px solid #374151',
            color: '#E5E7EB', padding: '2px 8px', borderRadius: 4, fontSize: 11,
            outline: 'none', marginLeft: 'auto',
          }}
        />
        <button
          onClick={fetchData}
          style={{
            background: 'rgba(0,0,0,0.4)', border: '1px solid #374151',
            color: '#9CA3AF', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}
        >↺</button>
      </div>

      {/* Assessment */}
      {assessment && (
        <div style={{
          margin: '0 12px 6px', padding: '6px 10px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid #EF4444',
          borderRadius: 4, fontSize: 11, color: '#FECACA', lineHeight: 1.5,
        }}>
          {assessment}
        </div>
      )}

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 12px' }}>
        {loading && <div style={{ color: '#9CA3AF', padding: 12 }}>Loading…</div>}
        {error && <div style={{ color: '#EF4444', padding: 8 }}>Error: {error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: '#6B7280', padding: 12, textAlign: 'center' }}>
            No profiles match the current filter.
          </div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ borderBottom: '1px solid #1F2937', marginBottom: 2 }}>
            <div
              onClick={() => toggleExpand(row.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}
            >
              <span style={{
                background: CLS_COLOR[row.cls] + '22',
                border: `1px solid ${CLS_COLOR[row.cls]}`,
                color: CLS_COLOR[row.cls], padding: '1px 6px',
                borderRadius: 3, fontSize: 10, minWidth: 96, textAlign: 'center',
              }}>{row.cls}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.label}
              </span>
              {row.category && (
                <span style={{ color: '#6B7280', fontSize: 10 }}>{row.category}</span>
              )}
              <span style={{ color: '#6B7280', fontSize: 10 }}>
                {row.matchedScenarios.length}S · {row.matchedKnowledge.length}K · {row.matchedNodes.length}N · {row.matchedTasks.length}T
              </span>
              <span style={{ color: '#6B7280' }}>{expanded[row.id] ? '▲' : '▼'}</span>
            </div>

            {expanded[row.id] && (
              <div style={{ paddingLeft: 12, paddingBottom: 6 }}>
                {/* Scenarios */}
                {row.matchedScenarios.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: '#38BDF8', fontSize: 10, marginBottom: 3 }}>SCENARIOS</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {row.matchedScenarios.slice(0, 8).map((s, i) => {
                        const st = (s.status || s.state || '').toLowerCase();
                        const sc = STATUS_COLOR[st] || '#6B7280';
                        return (
                          <span key={i} style={{
                            background: 'rgba(56,189,248,0.1)', border: '1px solid #38BDF8',
                            color: '#BAE6FD', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                          }}>
                            {s.name || s.title || `Scenario ${i + 1}`}
                            {st && (
                              <span style={{
                                background: sc + '22', border: `1px solid ${sc}`,
                                color: sc, marginLeft: 4, padding: '0 4px', borderRadius: 2, fontSize: 9,
                              }}>{st}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Knowledge */}
                {row.matchedKnowledge.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: '#A78BFA', fontSize: 10, marginBottom: 3 }}>KNOWLEDGE</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {row.matchedKnowledge.slice(0, 8).map((k, i) => {
                        const cat = k.category || k.type || '';
                        return (
                          <span key={i} style={{
                            background: 'rgba(167,139,250,0.1)', border: '1px solid #A78BFA',
                            color: '#DDD6FE', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                          }}>
                            {k.title || k.name || `Article ${i + 1}`}
                            {cat && (
                              <span style={{
                                background: 'rgba(167,139,250,0.2)', border: '1px solid #A78BFA',
                                color: '#A78BFA', marginLeft: 4, padding: '0 4px', borderRadius: 2, fontSize: 9,
                              }}>{cat}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Graph nodes */}
                {row.matchedNodes.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: '#F59E0B', fontSize: 10, marginBottom: 3 }}>GRAPH NODES</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {row.matchedNodes.slice(0, 8).map((n, i) => (
                        <span key={i} style={{
                          background: 'rgba(245,158,11,0.1)', border: '1px solid #F59E0B',
                          color: '#FDE68A', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                        }}>
                          {n.label || n.name || `Node ${i + 1}`}
                          {(n.centrality ?? n.score) !== undefined && (
                            <span style={{
                              background: 'rgba(56,189,248,0.1)', border: '1px solid #38BDF8',
                              color: '#38BDF8', marginLeft: 4, padding: '0 4px', borderRadius: 2, fontSize: 9,
                            }}>
                              {typeof (n.centrality ?? n.score) === 'number'
                                ? (n.centrality ?? n.score).toFixed(3)
                                : (n.centrality ?? n.score)}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tasks */}
                {row.matchedTasks.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: '#F97316', fontSize: 10, marginBottom: 3 }}>TASKS</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {row.matchedTasks.slice(0, 8).map((t, i) => {
                        const st = (t.status || t.state || '').toLowerCase();
                        const sc = STATUS_COLOR[st] || '#6B7280';
                        return (
                          <span key={i} style={{
                            background: 'rgba(249,115,22,0.1)', border: '1px solid #F97316',
                            color: '#FED7AA', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                          }}>
                            {t.title || t.name || `Task ${i + 1}`}
                            {st && (
                              <span style={{
                                background: sc + '22', border: `1px solid ${sc}`,
                                color: sc, marginLeft: 4, padding: '0 4px', borderRadius: 2, fontSize: 9,
                              }}>{st}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {row.matchedScenarios.length === 0 &&
                 row.matchedKnowledge.length === 0 &&
                 row.matchedNodes.length === 0 &&
                 row.matchedTasks.length === 0 && (
                  <div style={{ color: '#6B7280', fontSize: 11, padding: '2px 0' }}>
                    No matching sources — dark intelligence asset.
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
