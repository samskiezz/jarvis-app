import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GATADS_RE = /\b(gatads|annotation\s+task\s+dataset|graph\s+annotation\s+task|annotation\s+task\s+data|task\s+dataset\s+annotation|annotation\s+data\s+task|unaddressed\s+annotation|graph\s+annotation\s+data\s+task|task\s+backed\s+annotation|data\s+backed\s+annotation|annotation\s+task\s+coverage|annotation\s+dataset\s+coverage|task\s+annotation\s+data)\b/i;

export function isGatadsQuery(t) {
  return GATADS_RE.test(t || '');
}

export async function buildGatadsScript() {
  try {
    const [anRes, taskRes, dsRes] = await Promise.all([
      fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
    ]);
    const anns = normaliseAnnotations(anRes);
    const tasks = normaliseTasks(taskRes);
    const datasets = normaliseDatasets(dsRes);
    const classified = anns.map(a => classifyAnnotation(a, tasks, datasets));
    const fully = classified.filter(a => a.state === 'FULLY_SUPPORTED').length;
    const taskLinked = classified.filter(a => a.state === 'TASK_LINKED').length;
    const dataBacked = classified.filter(a => a.state === 'DATA_BACKED').length;
    const unaddressed = classified.filter(a => a.state === 'UNADDRESSED').length;
    return `GATADS graph annotation task-dataset coverage: ${anns.length} annotations — ${fully} fully supported (task+dataset), ${taskLinked} task-linked only, ${dataBacked} data-backed only, ${unaddressed} unaddressed (neither). ${unaddressed > 0 ? `${unaddressed} annotations have no task or dataset coverage — these represent operational governance gaps.` : 'All annotations have task or dataset coverage.'}`;
  } catch {
    return 'GATADS data unavailable — check /v1/graph/annotations, /entities/Task, and /v1/datasets endpoints.';
  }
}

const THRESHOLD = 0.07;

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

function normaliseAnnotations(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.annotations || raw?.items || raw?.data || raw?.results || []);
  return arr.map((a, i) => ({
    id: a.id || a._id || `ann-${i}`,
    label: a.label || a.title || a.name || a.text || `Annotation ${i + 1}`,
    targetType: a.target_type || a.targetType || a.entity_type || '',
    entity: a.entity || a.entity_id || a.target || '',
    notes: a.notes || a.description || a.body || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
  }));
}

function normaliseTasks(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.tasks || raw?.items || raw?.data || raw?.results || []);
  return arr.map((t, i) => ({
    id: t.id || t._id || `task-${i}`,
    name: t.name || t.title || t.task_name || `Task ${i + 1}`,
    description: t.description || t.summary || t.mission || '',
    priority: t.priority || t.severity || '',
    status: t.status || t.state || '',
    tags: Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.datasets || raw?.items || raw?.data || raw?.results || []);
  return arr.map((d, i) => ({
    id: d.id || d._id || `ds-${i}`,
    name: d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    description: d.description || d.summary || '',
    kind: d.kind || d.type || d.category || '',
    rowCount: d.row_count || d.rows || d.count || null,
    tags: Array.isArray(d.tags) ? d.tags.join(' ') : (d.tags || ''),
  }));
}

function classifyAnnotation(ann, tasks, datasets) {
  const aToks = tok([ann.label, ann.entity, ann.notes, ann.tags, ann.targetType].join(' '));

  const matchedTasks = tasks.filter(t => {
    const score = matchScore(aToks, [t.name, t.description, t.priority, t.tags].join(' '));
    return score >= THRESHOLD;
  });

  const matchedDatasets = datasets.filter(d => {
    const score = matchScore(aToks, [d.name, d.description, d.kind, d.tags].join(' '));
    return score >= THRESHOLD;
  });

  let state;
  if (matchedTasks.length > 0 && matchedDatasets.length > 0) state = 'FULLY_SUPPORTED';
  else if (matchedTasks.length > 0) state = 'TASK_LINKED';
  else if (matchedDatasets.length > 0) state = 'DATA_BACKED';
  else state = 'UNADDRESSED';

  return { ...ann, state, matchedTasks, matchedDatasets };
}

const STATE_META = {
  FULLY_SUPPORTED: { label: 'FULLY SUPPORTED', color: '#10b981', bg: 'rgba(16,185,129,0.13)' },
  TASK_LINKED:     { label: 'TASK LINKED',     color: '#f59e0b', bg: 'rgba(245,158,11,0.13)' },
  DATA_BACKED:     { label: 'DATA BACKED',     color: '#60a5fa', bg: 'rgba(96,165,250,0.13)' },
  UNADDRESSED:     { label: 'UNADDRESSED',     color: '#6b7280', bg: 'rgba(107,114,128,0.13)' },
};

const FILTERS = ['ALL', 'FULLY_SUPPORTED', 'TASK_LINKED', 'DATA_BACKED', 'UNADDRESSED'];

export default function GraphAnnotationTaskDatasetTriple() {
  const [open, setOpen] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [datasets, setDatasets] = useState([]);
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
      const [anRes, taskRes, dsRes] = await Promise.all([
        fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
      ]);
      const anNorm = normaliseAnnotations(anRes);
      const taskNorm = normaliseTasks(taskRes);
      const dsNorm = normaliseDatasets(dsRes);
      setAnnotations(anNorm);
      setTasks(taskNorm);
      setDatasets(dsNorm);
      setClassified(anNorm.map(a => classifyAnnotation(a, taskNorm, dsNorm)));
    } catch (e) {
      setError(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gatads-toggle', onToggle);
    return () => window.removeEventListener('jarvis:gatads-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const onVoice = e => {
      if (GATADS_RE.test(e.detail?.query || '')) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', onVoice);
    return () => window.removeEventListener('jarvis:voice-query', onVoice);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const fully = classified.filter(a => a.state === 'FULLY_SUPPORTED').map(a => a.label).slice(0, 4).join(', ');
      const unaddr = classified.filter(a => a.state === 'UNADDRESSED').map(a => a.label).slice(0, 3).join(', ');
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Assess GATADS graph annotation task-dataset coverage. ${annotations.length} annotations. Fully supported (task+dataset): ${fully || 'none'}. Unaddressed (no task or dataset backing): ${unaddr || 'none'}. In 2 sentences, identify which unaddressed annotations represent the highest operational governance gap and recommend the most urgent remediation action.`,
        }),
      });
      const data = r.ok ? await r.json() : null;
      const text = data?.response || data?.message || data?.answer || 'Assessment unavailable.';
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      setAssessment('Assessment failed — check /v1/jarvis/agent/chat.');
    } finally {
      setAssessing(false);
    }
  }, [classified, annotations.length]);

  if (!open) return null;

  const counts = {
    FULLY_SUPPORTED: classified.filter(a => a.state === 'FULLY_SUPPORTED').length,
    TASK_LINKED:     classified.filter(a => a.state === 'TASK_LINKED').length,
    DATA_BACKED:     classified.filter(a => a.state === 'DATA_BACKED').length,
    UNADDRESSED:     classified.filter(a => a.state === 'UNADDRESSED').length,
  };
  const total = classified.length || 1;

  const visible = classified.filter(ann => {
    if (filter !== 'ALL' && ann.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return ann.label.toLowerCase().includes(q) ||
             ann.entity.toLowerCase().includes(q) ||
             ann.notes.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={{
      position: 'fixed', left: 841440, bottom: 8, zIndex: 531,
      width: 520, maxHeight: '88vh',
      background: 'rgba(8,12,20,0.97)',
      border: '1px solid rgba(16,185,129,0.25)',
      borderRadius: 10,
      boxShadow: '0 0 32px rgba(16,185,129,0.08)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(16,185,129,0.15)',
        background: 'rgba(16,185,129,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>◈ GATADS</span>
          <span style={{ color: '#64748b', fontSize: 10 }}>GRAPH ANNOTATION × TASK × DATASET</span>
          {loading && <span style={{ color: '#10b981', fontSize: 10 }}>SYNCING…</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {counts.FULLY_SUPPORTED > 0 && (
            <span style={{
              background: 'rgba(16,185,129,0.2)', color: '#10b981',
              borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
            }}>{counts.FULLY_SUPPORTED} SUPPORTED</span>
          )}
          {counts.UNADDRESSED > 0 && (
            <span style={{
              background: 'rgba(107,114,128,0.18)', color: '#9ca3af',
              borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
            }}>{counts.UNADDRESSED} UNADDRESSED</span>
          )}
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          >×</button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '4px 12px', background: 'rgba(239,68,68,0.12)', color: '#f87171', fontSize: 11, flexShrink: 0 }}>
          ⚠ {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, padding: '8px 12px', flexShrink: 0 }}>
        {[
          { label: 'ANNOTATIONS',  value: annotations.length,           color: '#10b981' },
          { label: 'TASKS',        value: tasks.length,                 color: '#f59e0b' },
          { label: 'DATASETS',     value: datasets.length,              color: '#60a5fa' },
          { label: 'FULLY SUPP',   value: counts.FULLY_SUPPORTED,       color: '#10b981' },
          { label: 'TASK LINKED',  value: counts.TASK_LINKED,           color: '#f59e0b' },
          { label: 'DATA BACKED',  value: counts.DATA_BACKED,           color: '#60a5fa' },
          { label: 'UNADDRESSED',  value: counts.UNADDRESSED,           color: '#6b7280' },
          { label: 'COVERAGE',     value: `${Math.round(((total - counts.UNADDRESSED) / total) * 100)}%`, color: '#10b981' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(255,255,255,0.03)', borderRadius: 5,
            padding: '5px 6px', textAlign: 'center',
          }}>
            <div style={{ color: s.color, fontWeight: 700, fontSize: 14 }}>{s.value}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, background: '#1e293b', overflow: 'hidden', display: 'flex' }}>
          {(['FULLY_SUPPORTED', 'TASK_LINKED', 'DATA_BACKED', 'UNADDRESSED']).map(state => (
            <div key={state} style={{
              width: `${(counts[state] / total) * 100}%`,
              background: STATE_META[state].color,
              transition: 'width 0.4s',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          {Object.entries(STATE_META).map(([k, v]) => (
            <span key={k} style={{ color: v.color, fontSize: 9 }}>
              ■ {v.label} ({counts[k]})
            </span>
          ))}
        </div>
      </div>

      {/* Filters + Search */}
      <div style={{ padding: '0 12px 6px', display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${filter === f ? '#10b981' : 'rgba(255,255,255,0.08)'}`,
            color: filter === f ? '#10b981' : '#64748b',
            borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer',
          }}>
            {f === 'ALL' ? `ALL (${classified.length})` : `${STATE_META[f]?.label} (${counts[f]})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search annotations…"
          style={{
            flex: 1, minWidth: 80, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4,
            color: '#cbd5e1', padding: '2px 8px', fontSize: 10,
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 20 }}>No annotations match</div>
        )}
        {visible.map(item => {
          const meta = STATE_META[item.state];
          const isExp = expanded === item.id;
          return (
            <div key={item.id} style={{
              border: `1px solid ${isExp ? meta.color : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 6, marginBottom: 4,
              background: isExp ? meta.bg : 'rgba(255,255,255,0.02)',
              cursor: 'pointer', transition: 'all 0.2s',
            }} onClick={() => setExpanded(isExp ? null : item.id)}>
              {/* Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px' }}>
                <span style={{
                  background: meta.bg, color: meta.color,
                  borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}>{meta.label}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
                {item.targetType && (
                  <span style={{ color: '#64748b', fontSize: 9, whiteSpace: 'nowrap' }}>[{item.targetType}]</span>
                )}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded */}
              {isExp && (
                <div style={{ padding: '0 8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {/* Tasks */}
                  <div>
                    <div style={{ color: '#f59e0b', fontSize: 9, fontWeight: 700, marginBottom: 3 }}>
                      TASKS ({item.matchedTasks.length})
                    </div>
                    {item.matchedTasks.length === 0
                      ? <div style={{ color: '#334155', fontSize: 10 }}>No task matches</div>
                      : item.matchedTasks.slice(0, 5).map((t, idx) => (
                        <div key={t.id || idx} style={{ marginBottom: 3 }}>
                          <div style={{ color: '#cbd5e1', fontSize: 10 }}>
                            {t.name}
                            {t.status && <span style={{ color: '#f59e0b', fontSize: 9, marginLeft: 4 }}>[{t.status}]</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, marginTop: 2, background: '#1e293b', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(100, matchScore(tok([item.label, item.entity, item.notes, item.tags].join(' ')), [t.name, t.description, t.tags].join(' ')) * 100 / THRESHOLD)}%`,
                              background: '#f59e0b', height: '100%',
                            }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Datasets */}
                  <div>
                    <div style={{ color: '#60a5fa', fontSize: 9, fontWeight: 700, marginBottom: 3 }}>
                      DATASETS ({item.matchedDatasets.length})
                    </div>
                    {item.matchedDatasets.length === 0
                      ? <div style={{ color: '#334155', fontSize: 10 }}>No dataset matches</div>
                      : item.matchedDatasets.slice(0, 5).map(d => (
                        <div key={d.id} style={{ marginBottom: 3 }}>
                          <div style={{ color: '#cbd5e1', fontSize: 10 }}>
                            {d.name}
                            {d.kind && <span style={{ color: '#60a5fa', fontSize: 9, marginLeft: 4 }}>[{d.kind}]</span>}
                            {d.rowCount != null && <span style={{ color: '#475569', fontSize: 9, marginLeft: 4 }}>{d.rowCount.toLocaleString()} rows</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, marginTop: 2, background: '#1e293b', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(100, matchScore(tok([item.label, item.entity, item.notes, item.tags].join(' ')), [d.name, d.description, d.kind, d.tags].join(' ')) * 100 / THRESHOLD)}%`,
                              background: '#60a5fa', height: '100%',
                            }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assessment footer */}
      <div style={{
        borderTop: '1px solid rgba(16,185,129,0.12)',
        padding: '6px 12px', flexShrink: 0,
        background: 'rgba(16,185,129,0.04)',
      }}>
        {assessment && (
          <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 4, lineHeight: 1.5 }}>
            {assessment}
          </div>
        )}
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.12)',
          border: '1px solid rgba(16,185,129,0.3)', color: '#10b981',
          borderRadius: 5, padding: '4px 12px', fontSize: 10,
          cursor: assessing ? 'not-allowed' : 'pointer', fontFamily: 'monospace',
        }}>
          {assessing ? 'ASSESSING…' : '⬡ ASSESS ANNOTATION GOVERNANCE COVERAGE'}
        </button>
      </div>
    </div>
  );
}
