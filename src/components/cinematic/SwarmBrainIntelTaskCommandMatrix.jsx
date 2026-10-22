/**
 * SwarmBrainIntelTaskCommandMatrix — F114
 *
 * Fetches /entities/SwarmJob + /v1/cinematic/brain + /entities/IntelProfile + /entities/Task.
 *
 * Keyword-matches each swarm job (name/type/status/description) against
 * brain node labels/types, intel profile names/categories, and task titles/descriptions
 * to classify:
 *
 *   COMMANDING   — swarm job matches brain AND intel profile AND task
 *                  (fully anchored: modelled, attributed, and tasked)
 *   ORCHESTRATED — swarm job matches 2 of the 3 sources
 *                  (partially grounded — missing one axis)
 *   PROFILED     — swarm job matches only 1 of the 3 sources
 *                  (thin grounding — job exists but isn't operationally anchored)
 *   ADRIFT       — no match to any source
 *                  (automation blind spot — zero brain model, intel profile, or task)
 *
 * Toggle: ◈ SBIATCMD button (fixed, bottom strip) left:112200, zIndex:211
 * Stat tiles: swarm jobs / brain nodes / intel profiles / tasks / commanding / orchestrated / profiled / adrift
 * Red pulse on ADRIFT count (automation blind spots).
 * Expandable rows: matched brain nodes with centrality score badge +
 *                  matched intel profiles with category badge +
 *                  matched tasks with status badge.
 * Filter tabs: ALL / COMMANDING / ORCHESTRATED / PROFILED / ADRIFT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "sbiatcmd"/"swarm command"/"automation command"/"swarm brain intel"
 *        "swarm intel task"/"swarm command matrix"/"adrift swarm"/"swarm adrift"
 *        "automation blind spot"/"swarm profiled"/"swarm orchestrated"
 *        "swarm intelligence command"/"swarm task intel"/"commanding swarm"
 *        "swarm brain task"/"automation coverage"
 * Event: jarvis:sbiatcmd-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDING', 'ORCHESTRATED', 'PROFILED', 'ADRIFT'];

const CLS_COLOR = {
  COMMANDING:   '#22C55E',
  ORCHESTRATED: '#3B82F6',
  PROFILED:     '#F97316',
  ADRIFT:       '#EF4444',
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

export function isSbiatcmdQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'sbiatcmd', 'swarm command', 'automation command', 'swarm brain intel',
    'swarm intel task', 'swarm command matrix', 'adrift swarm', 'swarm adrift',
    'automation blind spot', 'swarm profiled', 'swarm orchestrated',
    'swarm intelligence command', 'swarm task intel', 'commanding swarm',
    'swarm brain task', 'automation coverage',
  ].some(kw => s.includes(kw));
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function classifySwarm(job, brainNodes, intelProfiles, tasks) {
  const toks = tokens(
    `${job.name || ''} ${job.type || ''} ${job.status || ''} ${job.description || ''} ${job.label || ''}`
  );
  const mNodes    = brainNodes.filter(n => overlaps(toks, `${n.label || ''} ${n.type || ''} ${n.name || ''}`));
  const mProfiles = intelProfiles.filter(p => overlaps(toks, `${p.name || ''} ${p.category || ''} ${p.type || ''} ${p.description || ''}`));
  const mTasks    = tasks.filter(t => overlaps(toks, `${t.title || ''} ${t.name || ''} ${t.description || ''} ${t.type || ''}`));

  const matchCount = (mNodes.length > 0 ? 1 : 0) + (mProfiles.length > 0 ? 1 : 0) + (mTasks.length > 0 ? 1 : 0);

  let cls;
  if (matchCount === 3) cls = 'COMMANDING';
  else if (matchCount === 2) cls = 'ORCHESTRATED';
  else if (matchCount === 1) cls = 'PROFILED';
  else cls = 'ADRIFT';

  return { job, cls, mNodes, mProfiles, mTasks };
}

export default function SwarmBrainIntelTaskCommandMatrix() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [swarmRaw, brainRaw, intelRaw, taskRaw] = await Promise.all([
        fetcher('/entities/SwarmJob'),
        fetcher('/v1/cinematic/brain'),
        fetcher('/entities/IntelProfile'),
        fetcher('/entities/Task'),
      ]);

      const swarmJobs    = normalizeArray(swarmRaw,  ['jobs', 'swarmJobs', 'data', 'items', 'results']);
      const brainNodes   = normalizeArray(brainRaw,  ['nodes', 'entities', 'data', 'items', 'results']);
      const intelProfiles = normalizeArray(intelRaw, ['profiles', 'intelProfiles', 'data', 'items', 'results']);
      const tasks        = normalizeArray(taskRaw,   ['tasks', 'data', 'items', 'results']);

      setRows(swarmJobs.map(j => classifySwarm(j, brainNodes, intelProfiles, tasks)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:sbiatcmd-toggle', handler);
    return () => window.removeEventListener('jarvis:sbiatcmd-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    COMMANDING:   rows.filter(r => r.cls === 'COMMANDING').length,
    ORCHESTRATED: rows.filter(r => r.cls === 'ORCHESTRATED').length,
    PROFILED:     rows.filter(r => r.cls === 'PROFILED').length,
    ADRIFT:       rows.filter(r => r.cls === 'ADRIFT').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.job.name || r.job.label || '').toLowerCase().includes(s) ||
             (r.job.description || r.job.type || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `SwarmJobs: ${rows.length}. Commanding: ${counts.COMMANDING}. Orchestrated: ${counts.ORCHESTRATED}. Profiled: ${counts.PROFILED}. Adrift: ${counts.ADRIFT}.`;
    const prompt = `JARVIS automation command intelligence audit: ${summary}. Identify the most critical adrift swarm jobs — those with no brain model grounding, no intel profile attribution, and no task grounding. Provide 2-sentence advisory on automation blind spots and recommended command structure improvements.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || JSON.stringify(d);
      setAssessment(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch (_) {}
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 112200, zIndex: 211,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ SBIATCMD</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 211, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ SBIATCMD</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>SwarmJob × Brain × IntelProfile × Task — Automation Command Intelligence</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #EF444455', color: '#EF4444', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'SWARM JOBS',   val: rows.length,            color: '#94a3b8' },
          { label: 'COMMANDING',   val: counts.COMMANDING,      color: CLS_COLOR.COMMANDING },
          { label: 'ORCHESTRATED', val: counts.ORCHESTRATED,    color: CLS_COLOR.ORCHESTRATED },
          { label: 'PROFILED',     val: counts.PROFILED,        color: CLS_COLOR.PROFILED },
          { label: 'ADRIFT',       val: counts.ADRIFT,          color: CLS_COLOR.ADRIFT, pulse: counts.ADRIFT > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 80, textAlign: 'center',
            animation: pulse ? 'sbiatcmd-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid #EF444444', borderRadius: 5, fontSize: 11, color: '#fca5a5', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#EF444422' : 'none',
            border: `1px solid ${tab === t ? '#EF4444' : '#1e293b'}`,
            color: tab === t ? '#EF4444' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search swarm jobs…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 180 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {err && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>Error: {err}</div>}
        {loading && !rows.length && <div style={{ color: '#64748b', fontSize: 11 }}>Loading…</div>}
        {visible.map((r, i) => {
          const isExp = !!expanded[i];
          return (
            <div key={i} style={{ marginBottom: 6, background: 'rgba(15,23,35,0.6)', border: `1px solid ${CLS_COLOR[r.cls]}33`, borderRadius: 5, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLS_COLOR[r.cls], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.job.name || r.job.label || r.job.id || '(unnamed)'}
                </span>
                {(r.job.type || r.job.status) && (
                  <span style={{ background: '#071428', border: '1px solid #075985', color: '#7dd3fc', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.job.type || r.job.status}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(r.job.description || r.job.summary) && (
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.job.description || r.job.summary}</div>
                  )}
                  {r.mNodes.length > 0 && (
                    <div>
                      <div style={{ color: '#22d3ee', fontSize: 10, marginBottom: 3 }}>BRAIN NODES ({r.mNodes.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mNodes.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#071420', border: '1px solid #0e7490', color: '#67e8f9', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.id}
                            {n.centrality != null && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{typeof n.centrality === 'number' ? n.centrality.toFixed(3) : n.centrality}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mProfiles.length > 0 && (
                    <div>
                      <div style={{ color: '#fb923c', fontSize: 10, marginBottom: 3 }}>INTEL PROFILES ({r.mProfiles.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mProfiles.slice(0, 8).map((p, k) => (
                          <span key={k} style={{ background: '#1c0d00', border: '1px solid #7c2d12', color: '#fdba74', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {p.name || p.id}
                            {p.category && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{p.category}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mTasks.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>TASKS ({r.mTasks.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mTasks.slice(0, 8).map((t, k) => (
                          <span key={k} style={{ background: '#1a0e2e', border: '1px solid #4c1d95', color: '#c4b5fd', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {t.title || t.name || t.id}
                            {t.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{t.status}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mNodes.length === 0 && r.mProfiles.length === 0 && r.mTasks.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No brain model, intel profile, or task match — automation blind spot.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes sbiatcmd-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
