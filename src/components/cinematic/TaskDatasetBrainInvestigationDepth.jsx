/**
 * TaskDatasetBrainInvestigationDepth — F111
 *
 * Fetches /entities/Task + /v1/datasets + /v1/cinematic/brain + /v1/investigations.
 *
 * Keyword-matches each task (title/description/type) against
 * dataset names/descriptions, brain node labels/types, and investigation summaries to classify:
 *
 *   GROUNDED  — task matches dataset AND brain AND investigation
 *               (fully anchored: data, model, and case grounding all in place)
 *   SUPPORTED — task matches dataset + at least one of brain or investigation
 *               (partially grounded — data exists but model or case missing)
 *   TRACKED   — task matches brain or investigation but NOT dataset
 *               (visible but no data grounding — execution without evidence)
 *   ADRIFT    — no match to any source
 *               (operational blind spot — no data, no model, no investigation)
 *
 * Toggle: ◈ TDBIEX button (fixed, bottom strip) left:110520, zIndex:208
 * Stat tiles: tasks / datasets / brain nodes / investigations / grounded / supported / tracked / adrift
 * Red pulse on ADRIFT count (operational blind spots).
 * Expandable rows: matched datasets with row-count badge +
 *                  matched brain nodes with centrality score badge +
 *                  matched investigations with status badge.
 * Filter tabs: ALL / GROUNDED / SUPPORTED / TRACKED / ADRIFT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "tdbiex"/"task execution depth"/"task grounding"/"adrift tasks"/"task blind spot"
 *        "task dataset"/"task brain"/"task investigation"/"execution depth"
 *        "grounded tasks"/"operational depth"/"task coverage"/"task anchor"
 * Event: jarvis:tdbiex-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'GROUNDED', 'SUPPORTED', 'TRACKED', 'ADRIFT'];

const CLS_COLOR = {
  GROUNDED:  '#22C55E',
  SUPPORTED: '#3B82F6',
  TRACKED:   '#F97316',
  ADRIFT:    '#EF4444',
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

export function isTdbiexQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'tdbiex', 'task execution depth', 'task grounding', 'adrift tasks', 'task blind spot',
    'task dataset', 'task brain', 'task investigation', 'execution depth',
    'grounded tasks', 'operational depth', 'task coverage', 'task anchor',
  ].some(kw => s.includes(kw));
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function classify(task, datasets, brainNodes, investigations) {
  const toks = tokens(`${task.title || ''} ${task.description || ''} ${task.type || ''} ${task.name || ''}`);
  const mDatasets       = datasets.filter(d => overlaps(toks, `${d.name || ''} ${d.description || ''} ${d.category || ''}`));
  const mBrainNodes     = brainNodes.filter(n => overlaps(toks, `${n.label || ''} ${n.type || ''}`));
  const mInvestigations = investigations.filter(inv => overlaps(toks, `${inv.title || ''} ${inv.summary || ''} ${inv.description || ''} ${inv.subject || ''}`));

  let cls;
  if (mDatasets.length && mBrainNodes.length && mInvestigations.length) cls = 'GROUNDED';
  else if (mDatasets.length && (mBrainNodes.length || mInvestigations.length)) cls = 'SUPPORTED';
  else if (mBrainNodes.length || mInvestigations.length) cls = 'TRACKED';
  else cls = 'ADRIFT';

  return { task, cls, mDatasets, mBrainNodes, mInvestigations };
}

export default function TaskDatasetBrainInvestigationDepth() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [taskRaw, dsRaw, brainRaw, invRaw] = await Promise.all([
        fetcher('/entities/Task'),
        fetcher('/v1/datasets'),
        fetcher('/v1/cinematic/brain'),
        fetcher('/v1/investigations'),
      ]);

      const tasks         = normalizeArray(taskRaw,  ['tasks', 'data', 'items', 'results']);
      const datasets      = normalizeArray(dsRaw,    ['datasets', 'data', 'items', 'results']);
      const brainNodes    = normalizeArray(brainRaw, ['nodes', 'entities', 'data', 'items', 'results']);
      const investigations = normalizeArray(invRaw,  ['investigations', 'data', 'items', 'results']);

      setRows(tasks.map(t => classify(t, datasets, brainNodes, investigations)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:tdbiex-toggle', handler);
    return () => window.removeEventListener('jarvis:tdbiex-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    GROUNDED:  rows.filter(r => r.cls === 'GROUNDED').length,
    SUPPORTED: rows.filter(r => r.cls === 'SUPPORTED').length,
    TRACKED:   rows.filter(r => r.cls === 'TRACKED').length,
    ADRIFT:    rows.filter(r => r.cls === 'ADRIFT').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.task.title || r.task.name || '').toLowerCase().includes(s) ||
             (r.task.description || '').toLowerCase().includes(s) ||
             (r.task.type || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Tasks: ${rows.length}. Grounded: ${counts.GROUNDED}. Supported: ${counts.SUPPORTED}. Tracked: ${counts.TRACKED}. Adrift: ${counts.ADRIFT}.`;
    const prompt = `JARVIS task execution depth audit: ${summary}. Identify the most critical adrift tasks with no dataset grounding, no brain model, and no linked investigation — pure operational blind spots. Provide 2-sentence advisory on execution depth gaps.`;
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
          position: 'fixed', bottom: 8, left: 110520, zIndex: 208,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ TDBIEX</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 208, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ TDBIEX</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Task × Dataset × Brain × Investigation — Operational Execution Depth</span>
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
          { label: 'TASKS',     val: rows.length,          color: '#94a3b8' },
          { label: 'GROUNDED',  val: counts.GROUNDED,      color: CLS_COLOR.GROUNDED },
          { label: 'SUPPORTED', val: counts.SUPPORTED,     color: CLS_COLOR.SUPPORTED },
          { label: 'TRACKED',   val: counts.TRACKED,       color: CLS_COLOR.TRACKED },
          { label: 'ADRIFT',    val: counts.ADRIFT,        color: CLS_COLOR.ADRIFT, pulse: counts.ADRIFT > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 80, textAlign: 'center',
            animation: pulse ? 'tdbiex-pulse 2s ease-in-out infinite' : 'none',
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
          placeholder="search tasks…"
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
                  {r.task.title || r.task.name || r.task.id || '(unnamed)'}
                </span>
                {r.task.type && (
                  <span style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.task.type}
                  </span>
                )}
                {r.task.status && (
                  <span style={{ background: '#0c1a0c', border: '1px solid #14532d', color: '#86efac', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.task.status}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.task.description && (
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.task.description}</div>
                  )}
                  {r.mDatasets.length > 0 && (
                    <div>
                      <div style={{ color: '#f59e0b', fontSize: 10, marginBottom: 3 }}>DATASETS ({r.mDatasets.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mDatasets.slice(0, 8).map((d, k) => (
                          <span key={k} style={{ background: '#1c1207', border: '1px solid #78350f', color: '#fcd34d', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {d.name || d.id}
                            {d.row_count != null && <span style={{ color: '#94a3b8', fontSize: 9 }}> {Number(d.row_count).toLocaleString()}r</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mBrainNodes.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>BRAIN NODES ({r.mBrainNodes.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mBrainNodes.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#1a0e2e', border: '1px solid #4c1d95', color: '#c4b5fd', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.id}
                            {n.centrality != null && <span style={{ color: '#94a3b8', fontSize: 9 }}> c:{Number(n.centrality).toFixed(2)}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mInvestigations.length > 0 && (
                    <div>
                      <div style={{ color: '#38bdf8', fontSize: 10, marginBottom: 3 }}>INVESTIGATIONS ({r.mInvestigations.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mInvestigations.slice(0, 8).map((inv, k) => (
                          <span key={k} style={{ background: '#071428', border: '1px solid #075985', color: '#7dd3fc', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {inv.title || inv.id}
                            {inv.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{inv.status}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mDatasets.length === 0 && r.mBrainNodes.length === 0 && r.mInvestigations.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No dataset, brain, or investigation match — operational blind spot.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes tdbiex-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
