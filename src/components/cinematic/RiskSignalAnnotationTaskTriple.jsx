import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RSGATRI_RE = /\b(rsgatri|risk\s+signal\s+annotation\s+task|annotated\s+risk|task\s+annotation\s+risk|risk\s+task\s+coverage|annotation\s+risk\s+signal|risk\s+graph\s+task|signal\s+task\s+triple|risk\s+annotation\s+triple|rsgatri\s+coverage)\b/i;

export function isRsgatriQuery(t) { return RSGATRI_RE.test(t || ''); }

export async function buildRsgatriScript() {
  try {
    const base = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
    const headers = { 'Content-Type': 'application/json' };
    const [rsRaw, annRaw, taskRaw] = await Promise.all([
      fetch(`${base}/entities/RiskSignal`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/graph/annotations`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/entities/Task`, { headers }).then(r => r.ok ? r.json() : []),
    ]);
    const signals = normaliseRiskSignals(rsRaw);
    const anns = normaliseAnnotations(annRaw);
    const tasks = normaliseTasks(taskRaw);
    const classified = signals.map(s => classifySignal(s, anns, tasks));
    const fully = classified.filter(s => s.state === 'FULLY_COVERED').length;
    const annotated = classified.filter(s => s.state === 'ANNOTATED').length;
    const tasked = classified.filter(s => s.state === 'TASKED').length;
    const exposed = classified.filter(s => s.state === 'EXPOSED').length;
    const total = classified.length;
    return `RSGATRI coverage: ${total} risk signals assessed against ${anns.length} graph annotations and ${tasks.length} tasks. Fully covered ${fully}, annotation-only ${annotated}, task-only ${tasked}, exposed ${exposed}. Coverage integrity ${total > 0 ? Math.round(((fully + annotated + tasked) / total) * 100) : 0}%.`;
  } catch {
    return 'RSGATRI coverage data unavailable.';
  }
}

const THRESHOLD = 0.07;

function tok(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  const hits = toks.filter(t => ft.includes(t)).length;
  return hits / toks.length;
}

function normaliseRiskSignals(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items || raw?.data || raw?.results || raw?.riskSignals || raw?.signals || []);
  return arr.map((s, i) => ({
    id: s.id || s._id || `rs-${i}`,
    name: s.name || s.title || s.signal || s.label || `Signal ${i + 1}`,
    description: s.description || s.summary || s.details || '',
    category: s.category || s.type || s.kind || '',
    severity: s.severity || s.level || s.risk_level || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function normaliseAnnotations(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items || raw?.data || raw?.results || raw?.annotations || []);
  return arr.map((a, i) => ({
    id: a.id || a._id || `ann-${i}`,
    label: a.label || a.name || a.title || a.text || a.content || `Annotation ${i + 1}`,
    note: a.note || a.description || a.body || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
    entity: a.entity || a.entity_id || a.target || '',
  }));
}

function normaliseTasks(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items || raw?.data || raw?.results || raw?.tasks || []);
  return arr.map((t, i) => ({
    id: t.id || t._id || `task-${i}`,
    title: t.title || t.name || t.label || `Task ${i + 1}`,
    description: t.description || t.summary || t.details || '',
    status: t.status || t.state || '',
    priority: t.priority || t.urgency || '',
    tags: Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function classifySignal(signal, annotations, tasks) {
  const toks = tok(`${signal.name} ${signal.description} ${signal.category} ${signal.severity} ${signal.tags}`);
  const matchedAnns = annotations.filter(a =>
    matchScore(toks, `${a.label} ${a.note} ${a.tags} ${a.entity}`) >= THRESHOLD
  );
  const matchedTasks = tasks.filter(t =>
    matchScore(toks, `${t.title} ${t.description} ${t.tags} ${t.status} ${t.priority}`) >= THRESHOLD
  );
  let state = 'EXPOSED';
  if (matchedAnns.length && matchedTasks.length) state = 'FULLY_COVERED';
  else if (matchedAnns.length) state = 'ANNOTATED';
  else if (matchedTasks.length) state = 'TASKED';
  return { ...signal, state, matchedAnns, matchedTasks };
}

const STATE_META = {
  FULLY_COVERED: { label: 'Fully Covered', color: '#29E7FF', bg: 'rgba(41,231,255,0.12)', badge: 'bg-cyan-900 text-cyan-300' },
  ANNOTATED:     { label: 'Annotated',     color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', badge: 'bg-violet-900 text-violet-300' },
  TASKED:        { label: 'Tasked',        color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  badge: 'bg-orange-900 text-orange-300' },
  EXPOSED:       { label: 'Exposed',       color: '#9ca3af', bg: 'rgba(156,163,175,0.10)', badge: 'bg-gray-800 text-gray-400' },
};

export default function RiskSignalAnnotationTaskTriple() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signals, setSignals] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      const [rsRaw, annRaw, taskRaw] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`, { headers }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/graph/annotations`, { headers }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/Task`, { headers }).then(r => r.ok ? r.json() : []),
      ]);
      const sigs = normaliseRiskSignals(rsRaw);
      const anns = normaliseAnnotations(annRaw);
      const tsks = normaliseTasks(taskRaw);
      const cls = sigs.map(s => classifySignal(s, anns, tsks));
      setSignals(sigs);
      setAnnotations(anns);
      setTasks(tsks);
      setClassified(cls);
    } catch (e) {
      setError(e.message || 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    const onVoice = e => { if (isRsgatriQuery(e.detail?.text || e.detail?.query || '')) setOpen(true); };
    window.addEventListener('jarvis:rsgatri-toggle', onToggle);
    window.addEventListener('jarvis:voice-query', onVoice);
    return () => {
      window.removeEventListener('jarvis:rsgatri-toggle', onToggle);
      window.removeEventListener('jarvis:voice-query', onVoice);
    };
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    fetchAll();
    timerRef.current = setInterval(fetchAll, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const total = classified.length;
      const fully = classified.filter(s => s.state === 'FULLY_COVERED').length;
      const exposed = classified.filter(s => s.state === 'EXPOSED').length;
      const msg = `RSGATRI coverage: ${total} risk signals, ${fully} fully covered (annotation+task), ${exposed} exposed with no annotation or task. Annotations: ${annotations.length}. Tasks: ${tasks.length}. Provide a 2-sentence operational risk coverage assessment.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ message: msg }),
      });
      const d = await r.json();
      const answer = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      if (answer) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: answer } }));
    } catch {}
    setAssessing(false);
  }, [classified, annotations, tasks]);

  if (!open) return null;

  const fully   = classified.filter(s => s.state === 'FULLY_COVERED').length;
  const annotated = classified.filter(s => s.state === 'ANNOTATED').length;
  const tasked  = classified.filter(s => s.state === 'TASKED').length;
  const exposed = classified.filter(s => s.state === 'EXPOSED').length;
  const total   = classified.length;
  const covPct  = total > 0 ? Math.round(((fully + annotated + tasked) / total) * 100) : 0;

  const visible = classified.filter(s => {
    if (filter !== 'ALL' && s.state !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.severity.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{
      position: 'fixed', left: 833040, bottom: 8, zIndex: 516,
      width: 540, background: 'rgba(8,14,26,0.97)',
      border: '1px solid rgba(41,231,255,0.18)', borderRadius: 12,
      boxShadow: '0 0 48px rgba(41,231,255,0.08)',
      fontFamily: '"Share Tech Mono",monospace', color: '#c8d8e8',
      display: 'flex', flexDirection: 'column', maxHeight: 680, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px 8px', borderBottom: '1px solid rgba(41,231,255,0.10)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#29E7FF', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>◈ RSGATRI</span>
          <span style={{ color: '#4a6080', fontSize: 10 }}>RISK SIGNAL × ANNOTATION × TASK</span>
          {loading && <span style={{ color: '#29E7FF', fontSize: 10, opacity: 0.7 }}>…</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {exposed > 0 && (
            <span style={{ background: 'rgba(156,163,175,0.18)', color: '#9ca3af', fontSize: 10, borderRadius: 4, padding: '1px 6px' }}>
              {exposed} EXPOSED
            </span>
          )}
          {fully > 0 && (
            <span style={{ background: 'rgba(41,231,255,0.15)', color: '#29E7FF', fontSize: 10, borderRadius: 4, padding: '1px 6px' }}>
              {fully} COVERED
            </span>
          )}
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#4a6080', cursor: 'pointer', fontSize: 14, lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, background: 'rgba(248,113,113,0.08)', flexShrink: 0 }}>
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, padding: '10px 14px 6px', flexShrink: 0 }}>
        {[
          { label: 'SIGNALS', val: total, color: '#29E7FF' },
          { label: 'ANNOTATIONS', val: annotations.length, color: '#a78bfa' },
          { label: 'TASKS', val: tasks.length, color: '#fb923c' },
          { label: 'COVERAGE', val: `${covPct}%`, color: covPct >= 70 ? '#4ade80' : covPct >= 40 ? '#facc15' : '#f87171' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(41,231,255,0.08)',
            borderRadius: 6, padding: '6px 8px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#4a6080', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, padding: '0 14px 8px', flexShrink: 0 }}>
        {[
          { label: 'FULLY COVERED', val: fully, color: '#29E7FF' },
          { label: 'ANNOTATED', val: annotated, color: '#a78bfa' },
          { label: 'TASKED', val: tasked, color: '#fb923c' },
          { label: 'EXPOSED', val: exposed, color: '#9ca3af' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(41,231,255,0.06)',
            borderRadius: 6, padding: '5px 6px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#4a6080', marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {total > 0 && (
        <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
          <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${(fully / total) * 100}%`, background: '#29E7FF', transition: 'width .4s' }} />
            <div style={{ width: `${(annotated / total) * 100}%`, background: '#a78bfa', transition: 'width .4s' }} />
            <div style={{ width: `${(tasked / total) * 100}%`, background: '#fb923c', transition: 'width .4s' }} />
            <div style={{ width: `${(exposed / total) * 100}%`, background: 'rgba(156,163,175,0.35)', transition: 'width .4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {[['#29E7FF','Fully Covered'],['#a78bfa','Annotated'],['#fb923c','Tasked'],['#9ca3af','Exposed']].map(([c,l]) => (
              <span key={l} style={{ fontSize: 9, color: '#4a6080', display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block' }} />{l}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL','FULLY_COVERED','ANNOTATED','TASKED','EXPOSED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontSize: 9, padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
            background: filter === f ? 'rgba(41,231,255,0.18)' : 'rgba(255,255,255,0.04)',
            color: filter === f ? '#29E7FF' : '#4a6080', fontFamily: 'inherit',
          }}>{f.replace('_', ' ')}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search signals…"
          style={{
            marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 4,
            border: '1px solid rgba(41,231,255,0.12)', background: 'rgba(255,255,255,0.03)',
            color: '#c8d8e8', fontFamily: 'inherit', width: 120, outline: 'none',
          }}
        />
      </div>

      {/* Signal list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 4px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#4a6080', fontSize: 11, textAlign: 'center', padding: '20px 0' }}>
            No signals match current filter.
          </div>
        )}
        {visible.map(sig => {
          const meta = STATE_META[sig.state];
          const isExp = expanded === sig.id;
          return (
            <div key={sig.id} style={{
              marginBottom: 6, borderRadius: 7,
              border: `1px solid ${isExp ? meta.color + '44' : 'rgba(41,231,255,0.07)'}`,
              background: isExp ? meta.bg : 'rgba(255,255,255,0.02)',
              cursor: 'pointer', transition: 'all .2s',
            }} onClick={() => setExpanded(isExp ? null : sig.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px' }}>
                <span style={{ fontSize: 10, color: meta.color, fontWeight: 700, minWidth: 90 }}>{meta.label}</span>
                <span style={{ fontSize: 11, flex: 1, color: '#c8d8e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sig.name}</span>
                <span style={{ fontSize: 9, color: '#4a6080' }}>
                  {sig.matchedAnns.length}A {sig.matchedTasks.length}T
                </span>
                {sig.severity && (
                  <span style={{ fontSize: 9, color: '#9ca3af', border: '1px solid rgba(156,163,175,0.2)', borderRadius: 3, padding: '0 4px' }}>
                    {sig.severity}
                  </span>
                )}
                <span style={{ color: '#4a6080', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px', display: 'flex', gap: 10 }}>
                  {/* Matched annotations */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: '#a78bfa', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Annotations ({sig.matchedAnns.length})
                    </div>
                    {sig.matchedAnns.length === 0 ? (
                      <div style={{ fontSize: 10, color: '#4a6080' }}>No matched annotations</div>
                    ) : sig.matchedAnns.slice(0, 5).map(a => (
                      <div key={a.id} style={{
                        fontSize: 10, color: '#c8d8e8', marginBottom: 3,
                        padding: '3px 6px', background: 'rgba(167,139,250,0.08)',
                        borderRadius: 4, borderLeft: '2px solid #a78bfa',
                      }}>
                        <div style={{ fontWeight: 600, color: '#a78bfa' }}>{a.label}</div>
                        {a.note && <div style={{ color: '#6b7a90', marginTop: 1 }}>{a.note.slice(0, 60)}{a.note.length > 60 ? '…' : ''}</div>}
                      </div>
                    ))}
                    {sig.matchedAnns.length > 5 && (
                      <div style={{ fontSize: 9, color: '#4a6080' }}>+{sig.matchedAnns.length - 5} more</div>
                    )}
                  </div>
                  {/* Matched tasks */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: '#fb923c', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Tasks ({sig.matchedTasks.length})
                    </div>
                    {sig.matchedTasks.length === 0 ? (
                      <div style={{ fontSize: 10, color: '#4a6080' }}>No matched tasks</div>
                    ) : sig.matchedTasks.slice(0, 5).map(t => (
                      <div key={t.id} style={{
                        fontSize: 10, color: '#c8d8e8', marginBottom: 3,
                        padding: '3px 6px', background: 'rgba(251,146,60,0.08)',
                        borderRadius: 4, borderLeft: '2px solid #fb923c',
                      }}>
                        <div style={{ fontWeight: 600, color: '#fb923c' }}>{t.title}</div>
                        {t.status && <div style={{ color: '#6b7a90', marginTop: 1 }}>Status: {t.status}</div>}
                      </div>
                    ))}
                    {sig.matchedTasks.length > 5 && (
                      <div style={{ fontSize: 9, color: '#4a6080' }}>+{sig.matchedTasks.length - 5} more</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 14px', borderTop: '1px solid rgba(41,231,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, color: '#4a6080' }}>
          {visible.length} of {total} signals · 60s refresh
        </span>
        <button onClick={assess} disabled={assessing || !classified.length} style={{
          fontSize: 10, padding: '4px 12px', borderRadius: 5,
          border: '1px solid rgba(41,231,255,0.25)', background: 'rgba(41,231,255,0.08)',
          color: assessing ? '#4a6080' : '#29E7FF', cursor: assessing ? 'default' : 'pointer',
          fontFamily: 'inherit',
        }}>
          {assessing ? 'Assessing…' : 'Assess Coverage'}
        </button>
      </div>
    </div>
  );
}
