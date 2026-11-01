/**
 * TaskKnowledgeBrainGraphFoundation — F262
 *
 * Fetches /entities/Task
 *         /knowledge/
 *         /v1/cinematic/brain
 *         /v1/graph/centrality
 *
 * Keyword-matches each task (name/description/objective/tags)
 * against knowledge articles, brain nodes, and graph centrality nodes
 * to classify:
 *
 *   GROUNDED — matches all 3 other sources
 *              (task has knowledge backing, brain model, AND graph trace)
 *   KNOWN    — matches 2 of 3 other sources
 *   PARTIAL  — matches exactly 1 other source
 *   ADRIFT   — no match to any source
 *              (operationally blind tasks — no knowledge grounding,
 *               no brain model, no graph trace)
 *
 * Toggle: ◈ TKBGF button (fixed, bottom strip) left:194520, zIndex:358
 * Stat tiles: tasks / knowledge / brain nodes / graph nodes /
 *             grounded / known / partial / adrift
 * Red pulse on ADRIFT count (mission blind spots).
 * Expandable rows: matched knowledge articles with category badge +
 *                  matched brain nodes with type badge +
 *                  matched graph nodes with centrality score badge.
 * Filter tabs: ALL / GROUNDED / KNOWN / PARTIAL / ADRIFT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "tkbgf"/"task knowledge brain"/"mission foundation"/
 *        "adrift tasks"/"task brain graph"/"task knowledge map"/
 *        "mission blind spot"/"task graph foundation"/"task intelligence foundation"
 * Event: jarvis:tkbgf-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from "@/api/cinematicDataAdapters";

// API base resolved via apiBase()
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'GROUNDED', 'KNOWN', 'PARTIAL', 'ADRIFT'];

const CLS_COLOR = {
  GROUNDED: '#22C55E',
  KNOWN:    '#F59E0B',
  PARTIAL:  '#38BDF8',
  ADRIFT:   '#EF4444',
};

export function isTkbgfQuery(q) {
  const s = (q || '').toLowerCase();
  return s.includes('tkbgf') ||
    s.includes('task knowledge brain') ||
    s.includes('mission foundation') ||
    s.includes('adrift tasks') ||
    s.includes('task brain graph') ||
    s.includes('task knowledge map') ||
    s.includes('mission blind spot') ||
    s.includes('task graph foundation') ||
    s.includes('task intelligence foundation');
}

export function buildTkbgfScript() {
  return 'Analyse the Task × Knowledge × Brain × Graph Mission Intelligence Foundation. ' +
    'Identify ADRIFT tasks (no knowledge grounding, no brain model, no graph trace — mission blind spots). ' +
    'Recommend the top 3 most critical adrift tasks to ground with knowledge and intelligence backing. ' +
    'Keep the response under 120 words.';
}

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.tasks))       return raw.tasks;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

function normalizeKnowledge(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.articles))    return raw.articles;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

function normalizeBrainNodes(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.nodes))       return raw.nodes;
  if (Array.isArray(raw?.brain_nodes)) return raw.brain_nodes;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

function normalizeGraphNodes(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.nodes))       return raw.nodes;
  if (Array.isArray(raw?.centrality))  return raw.centrality;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

function taskText(t) {
  return [t.name, t.title, t.description, t.type, t.category,
          t.objective, t.tags, t.status, t.priority].filter(Boolean).join(' ');
}

function classifyTask(taskToks, articles, brainNodes, graphNodes) {
  const matchedArticles = articles.filter(a => {
    const t = [a.name, a.title, a.description, a.content, a.category,
               a.tags, a.keywords].filter(Boolean).join(' ');
    return overlaps(taskToks, t);
  });
  const matchedBrain = brainNodes.filter(n => {
    const t = [n.name, n.title, n.description, n.type, n.label,
               n.category, n.tags].filter(Boolean).join(' ');
    return overlaps(taskToks, t);
  });
  const matchedGraph = graphNodes.filter(n => {
    const t = [n.name, n.title, n.description, n.type, n.label,
               n.category, n.tags].filter(Boolean).join(' ');
    return overlaps(taskToks, t);
  });
  const hits = (matchedArticles.length > 0 ? 1 : 0)
             + (matchedBrain.length > 0 ? 1 : 0)
             + (matchedGraph.length > 0 ? 1 : 0);
  const cls = hits === 3 ? 'GROUNDED'
            : hits === 2 ? 'KNOWN'
            : hits === 1 ? 'PARTIAL'
            : 'ADRIFT';
  return { cls, matchedArticles, matchedBrain, matchedGraph };
}

const hdr = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

async function apiFetch(path) {
  const r = await fetch(`${API}${path}`, { headers: hdr });
  if (!r.ok) return null;
  return r.json();
}

export default function TaskKnowledgeBrainGraphFoundation() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [advice, setAdvice]       = useState('');
  const timerRef                  = useRef(null);

  const counts = {
    GROUNDED: rows.filter(r => r.cls === 'GROUNDED').length,
    KNOWN:    rows.filter(r => r.cls === 'KNOWN').length,
    PARTIAL:  rows.filter(r => r.cls === 'PARTIAL').length,
    ADRIFT:   rows.filter(r => r.cls === 'ADRIFT').length,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tkRaw, knRaw, brRaw, grRaw] = await Promise.all([
        apiFetch('/entities/Task'),
        apiFetch('/knowledge/'),
        apiFetch('/v1/cinematic/brain'),
        apiFetch('/v1/graph/centrality'),
      ]);
      const tasks      = normalizeTasks(tkRaw);
      const articles   = normalizeKnowledge(knRaw);
      const brainNodes = normalizeBrainNodes(brRaw);
      const graphNodes = normalizeGraphNodes(grRaw);

      const classified = tasks.map(task => {
        const taskToks = tokens(taskText(task));
        const { cls, matchedArticles, matchedBrain, matchedGraph } =
          classifyTask(taskToks, articles, brainNodes, graphNodes);
        return { task, cls, matchedArticles, matchedBrain, matchedGraph };
      });
      setRows(classified);
    } catch { /* network offline — keep stale data */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:tkbgf-toggle', toggle);
    return () => window.removeEventListener('jarvis:tkbgf-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    setAdvice('');
    try {
      const prompt = buildTkbgfScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.text || JSON.stringify(d);
      setAdvice(text);
      try {
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: 'POST', headers: hdr,
          body: JSON.stringify({ text: text.slice(0, 300) }),
        });
      } catch { /* TTS optional */ }
    } catch { setAdvice('Assessment unavailable — check backend connectivity.'); }
    setAssessing(false);
  }

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const t = (r.task.name || r.task.title || '').toLowerCase();
      if (!t.includes(s)) return false;
    }
    return true;
  });

  const adriftCount = counts.ADRIFT;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Task × Knowledge × Brain × Graph Mission Intelligence Foundation"
        style={{
          position: 'fixed', left: 194520, bottom: 8, zIndex: 358,
          background: 'rgba(5,8,13,0.82)', border: '1px solid #22D3EE44',
          color: '#22D3EE', borderRadius: 6, padding: '3px 8px',
          fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1,
          boxShadow: adriftCount > 0 ? '0 0 8px #EF444466' : 'none',
        }}
      >
        ◈ TKBGF
        {adriftCount > 0 && (
          <span style={{
            marginLeft: 5, background: '#EF4444', color: '#fff',
            borderRadius: 4, padding: '1px 5px', fontSize: 10,
            animation: 'tkbgf-pulse 1.4s ease-in-out infinite',
          }}>{adriftCount}</span>
        )}
        <style>{`@keyframes tkbgf-pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1060,
      background: 'rgba(2,5,10,0.93)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'JetBrains Mono',monospace", color: '#DCEBF5',
      padding: '18px 20px', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span style={{ color: '#22D3EE', fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>
          ◈ TKBGF — TASK × KNOWLEDGE × BRAIN × GRAPH MISSION INTELLIGENCE FOUNDATION
        </span>
        <button onClick={() => setOpen(false)} style={{
          marginLeft: 'auto', background: 'none', border: '1px solid #22D3EE44',
          color: '#22D3EE', borderRadius: 4, padding: '2px 10px',
          cursor: 'pointer', fontSize: 12,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          { label: 'TASKS',        val: rows.length,                                                 color: '#22D3EE' },
          { label: 'KNOWLEDGE',    val: rows.reduce((a, r) => a + r.matchedArticles.length, 0),     color: '#A78BFA' },
          { label: 'BRAIN NODES',  val: rows.reduce((a, r) => a + r.matchedBrain.length, 0),        color: '#F59E0B' },
          { label: 'GRAPH NODES',  val: rows.reduce((a, r) => a + r.matchedGraph.length, 0),        color: '#38BDF8' },
          { label: 'GROUNDED',     val: counts.GROUNDED, color: CLS_COLOR.GROUNDED },
          { label: 'KNOWN',        val: counts.KNOWN,    color: CLS_COLOR.KNOWN    },
          { label: 'PARTIAL',      val: counts.PARTIAL,  color: CLS_COLOR.PARTIAL  },
          { label: 'ADRIFT',       val: counts.ADRIFT,   color: CLS_COLOR.ADRIFT   },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}44`,
            borderRadius: 6, padding: '6px 12px', minWidth: 90, textAlign: 'center',
          }}>
            <div style={{ color, fontSize: 18, fontWeight: 700 }}>{val}</div>
            <div style={{ color: '#8899AA', fontSize: 10, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {loading && (
        <div style={{ color: '#22D3EE88', fontSize: 11, marginBottom: 8 }}>
          ⟳ Loading task intelligence data…
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#22D3EE22' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${tab === t ? '#22D3EE' : '#22D3EE22'}`,
            color: tab === t ? '#22D3EE' : '#8899AA',
            borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
          }}>{t} {t !== 'ALL' ? `(${counts[t] ?? 0})` : `(${rows.length})`}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid #22D3EE22',
            color: '#DCEBF5', borderRadius: 4, padding: '3px 10px', fontSize: 11,
            outline: 'none', minWidth: 180,
          }}
        />
      </div>

      {/* ASSESS button */}
      <div style={{ marginBottom: 12 }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? 'rgba(34,211,238,0.08)' : 'rgba(34,211,238,0.14)',
          border: '1px solid #22D3EE66', color: '#22D3EE',
          borderRadius: 5, padding: '5px 16px', fontSize: 12,
          cursor: assessing ? 'not-allowed' : 'pointer', letterSpacing: 1,
        }}>
          {assessing ? '⟳ ASSESSING…' : '▶ ASSESS MISSION FOUNDATION'}
        </button>
        {advice && (
          <div style={{
            marginTop: 8, padding: '8px 12px',
            background: 'rgba(34,211,238,0.06)', border: '1px solid #22D3EE33',
            borderRadius: 5, fontSize: 11, color: '#DCEBF5', whiteSpace: 'pre-wrap',
          }}>{advice}</div>
        )}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#8899AA', fontSize: 12, padding: '12px 0' }}>
            No tasks match the current filter.
          </div>
        )}
        {visible.map((row, idx) => {
          const { task, cls, matchedArticles, matchedBrain, matchedGraph } = row;
          const id   = task.id || task._id || idx;
          const name = task.name || task.title || `Task #${idx + 1}`;
          const stat = task.status || task.state || '—';
          const isEx = expanded[id];
          return (
            <div key={id} style={{
              borderBottom: '1px solid #22D3EE11',
              padding: '7px 0',
            }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                onClick={() => setExpanded(e => ({ ...e, [id]: !isEx }))}
              >
                <span style={{
                  background: `${CLS_COLOR[cls]}22`,
                  color: CLS_COLOR[cls],
                  border: `1px solid ${CLS_COLOR[cls]}55`,
                  borderRadius: 4, padding: '1px 7px', fontSize: 10, minWidth: 72,
                  textAlign: 'center',
                }}>{cls}</span>
                <span style={{ fontSize: 12, flex: 1, color: '#DCEBF5' }}>{name}</span>
                <span style={{
                  fontSize: 10, color: '#8899AA',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid #33445566', borderRadius: 3, padding: '1px 6px',
                }}>{stat}</span>
                <span style={{ color: '#22D3EE55', fontSize: 11 }}>{isEx ? '▲' : '▼'}</span>
              </div>

              {isEx && (
                <div style={{
                  marginTop: 8, marginLeft: 16, paddingLeft: 12,
                  borderLeft: '2px solid #22D3EE22',
                }}>
                  {/* Knowledge articles */}
                  {matchedArticles.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: '#A78BFA', fontSize: 10, marginBottom: 4, letterSpacing: 1 }}>
                        KNOWLEDGE ({matchedArticles.length})
                      </div>
                      {matchedArticles.slice(0, 5).map((a, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontSize: 11, color: '#DCEBF5' }}>
                            {a.title || a.name || `Article #${i + 1}`}
                          </span>
                          {(a.category || a.type) && (
                            <span style={{
                              fontSize: 9, color: '#A78BFA',
                              background: '#A78BFA22', border: '1px solid #A78BFA44',
                              borderRadius: 3, padding: '0 5px',
                            }}>{a.category || a.type}</span>
                          )}
                        </div>
                      ))}
                      {matchedArticles.length > 5 && (
                        <div style={{ fontSize: 10, color: '#8899AA' }}>
                          +{matchedArticles.length - 5} more articles
                        </div>
                      )}
                    </div>
                  )}

                  {/* Brain nodes */}
                  {matchedBrain.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: '#F59E0B', fontSize: 10, marginBottom: 4, letterSpacing: 1 }}>
                        BRAIN NODES ({matchedBrain.length})
                      </div>
                      {matchedBrain.slice(0, 5).map((n, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontSize: 11, color: '#DCEBF5' }}>
                            {n.name || n.label || `Node #${i + 1}`}
                          </span>
                          {(n.type || n.category) && (
                            <span style={{
                              fontSize: 9, color: '#F59E0B',
                              background: '#F59E0B22', border: '1px solid #F59E0B44',
                              borderRadius: 3, padding: '0 5px',
                            }}>{n.type || n.category}</span>
                          )}
                        </div>
                      ))}
                      {matchedBrain.length > 5 && (
                        <div style={{ fontSize: 10, color: '#8899AA' }}>
                          +{matchedBrain.length - 5} more brain nodes
                        </div>
                      )}
                    </div>
                  )}

                  {/* Graph nodes */}
                  {matchedGraph.length > 0 && (
                    <div>
                      <div style={{ color: '#38BDF8', fontSize: 10, marginBottom: 4, letterSpacing: 1 }}>
                        GRAPH NODES ({matchedGraph.length})
                      </div>
                      {matchedGraph.slice(0, 5).map((n, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontSize: 11, color: '#DCEBF5' }}>
                            {n.name || n.label || `Node #${i + 1}`}
                          </span>
                          {n.centrality !== undefined && (
                            <span style={{
                              fontSize: 9, color: '#38BDF8',
                              background: '#38BDF822', border: '1px solid #38BDF844',
                              borderRadius: 3, padding: '0 5px',
                            }}>{Number(n.centrality).toFixed(3)}</span>
                          )}
                        </div>
                      ))}
                      {matchedGraph.length > 5 && (
                        <div style={{ fontSize: 10, color: '#8899AA' }}>
                          +{matchedGraph.length - 5} more graph nodes
                        </div>
                      )}
                    </div>
                  )}

                  {matchedArticles.length === 0 && matchedBrain.length === 0 && matchedGraph.length === 0 && (
                    <div style={{ fontSize: 11, color: '#EF4444' }}>
                      No knowledge article, brain model, or graph trace found — mission blind spot.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
