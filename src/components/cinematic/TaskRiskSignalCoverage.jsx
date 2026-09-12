import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TRSCOV_RE = /\b(trscov|task\s+risk\s+signal|task\s+risk\s+coverage|task\s+at[\s-]?risk|risky\s+task|risk\s+signal\s+task|task\s+risk\s+scan|task\s+risk\s+check)\b/i;

export function isTrscovQuery(t) { return TRSCOV_RE.test(t || ''); }

export async function buildTrscovScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [taskR, riskR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
  ]);
  const taskRaw = taskR.value ?? {};
  const tasks = Array.isArray(taskRaw) ? taskRaw : (taskRaw.tasks ?? taskRaw.data ?? taskRaw.results ?? []);
  const riskRaw = riskR.value ?? {};
  const signals = Array.isArray(riskRaw) ? riskRaw : (riskRaw.signals ?? riskRaw.data ?? riskRaw.results ?? []);

  const sigText = signals.map(s => `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.type ?? ''} ${s.tags ?? ''}`.toLowerCase()).join(' ');

  let atRisk = 0, clear = 0;
  for (const task of tasks) {
    const text = `${task.name ?? task.title ?? task.id ?? ''} ${task.description ?? ''} ${task.type ?? ''} ${task.priority ?? ''} ${task.tags ?? ''}`.toLowerCase();
    const tokens = text.split(/\W+/).filter(t => t.length > 2);
    const has = tokens.some(tok => sigText.includes(tok));
    if (has) atRisk++;
    else clear++;
  }
  return `TRSCOV Task × Risk Signal Coverage: ${tasks.length} tasks assessed against ${signals.length} risk signals. ` +
    `AT-RISK: ${atRisk} (at least one risk signal covers this task domain). ` +
    `CLEAR: ${clear} (no matching risk signal — may indicate a blind spot or genuine low-risk task).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'AT-RISK': '#ef4444',
  CLEAR: '#22c55e',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreTask(task, signals) {
  const text = `${task.name ?? task.title ?? task.id ?? ''} ${task.description ?? ''} ${task.type ?? ''} ${task.priority ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const sig of signals) {
    const sigText = `${sig.name ?? sig.title ?? sig.id ?? ''} ${sig.description ?? ''} ${sig.type ?? ''} ${sig.severity ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => sigText.includes(tok));
    if (hits.length > 0) matched.push({ item: sig, score: Math.min(100, hits.length * 30) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(task, signals) {
  const text = `${task.name ?? task.title ?? task.id ?? ''} ${task.description ?? ''} ${task.type ?? ''} ${task.priority ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const sigText = signals.map(s => `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.type ?? ''}`.toLowerCase()).join(' ');
  return tokens.some(tok => sigText.includes(tok)) ? 'AT-RISK' : 'CLEAR';
}

export default function TaskRiskSignalCoverage() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [signals, setSignals] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [taskR, riskR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
      ]);
      const taskRaw = taskR.value ?? {};
      const tsks = Array.isArray(taskRaw) ? taskRaw : (taskRaw.tasks ?? taskRaw.data ?? taskRaw.results ?? []);
      const riskRaw = riskR.value ?? {};
      const sigs = Array.isArray(riskRaw) ? riskRaw : (riskRaw.signals ?? riskRaw.data ?? riskRaw.results ?? []);
      setTasks(tsks);
      setSignals(sigs);
      setRows(tsks.map(task => ({
        task,
        state: correlate(task, sigs),
        matched: scoreTask(task, sigs),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:trscov-toggle', onToggle);
    return () => window.removeEventListener('jarvis:trscov-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const atRiskCount = rows.filter(r => r.state === 'AT-RISK').length;
  const clearCount = rows.filter(r => r.state === 'CLEAR').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${r.task.name ?? r.task.title ?? r.task.id ?? ''} ${r.task.type ?? ''} ${r.task.priority ?? ''}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.task.name ?? row.task.title ?? row.task.id ?? 'task';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const sigNames = row.matched.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'AT-RISK'
        ? `is flagged AT-RISK with matching risk signals (${sigNames || 'found'})`
        : 'is CLEAR — no matching risk signals found for this task domain';
      const prompt = `Task "${id}" ${stateDesc}. In exactly 2 sentences, assess the risk exposure for this task and recommend immediate action.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const brief = data.response ?? data.message ?? data.content ?? data.text ?? '';
      if (brief) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: brief } }));
    } catch (_) {}
    setAssessing(null);
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', left: 786000, bottom: 8, zIndex: 432,
      width: 520, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(239,68,68,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#ef4444', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ TRSCOV — TASK × RISK SIGNAL COVERAGE</span>
        {atRiskCount > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{atRiskCount} AT-RISK</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Tasks', val: tasks.length },
          { label: 'Risk Signals', val: signals.length, color: '#ef4444' },
          { label: 'At-Risk', val: atRiskCount, color: '#ef4444' },
          { label: 'Clear', val: clearCount, color: '#22c55e' },
        ].map(t => (
          <div key={t.label} style={TILE}>
            <div style={LABEL}>{t.label}</div>
            <div style={{ ...VAL, color: t.color ?? '#e2e8f0' }}>{loading ? '…' : t.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round((atRiskCount / rows.length) * 100)}%`, background: '#ef4444', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((atRiskCount / rows.length) * 100) : 0}% at-risk · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'AT-RISK', 'CLEAR'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#ef4444') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? '#fff' : '#aaa', cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no tasks match</div>
        )}
        {visible.map((row, i) => {
          const id = row.task.name ?? row.task.title ?? row.task.id ?? `task-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.task.type && (
                  <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(148,163,184,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.task.type}</span>
                )}
                {row.task.priority && (
                  <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(100,116,139,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.task.priority}</span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, color: '#ef4444', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ fontSize: 10, color: '#ef4444', marginBottom: 6, letterSpacing: 1, fontWeight: 700 }}>
                    MATCHED RISK SIGNALS ({row.matched.length})
                  </div>
                  {row.matched.length === 0 ? (
                    <div style={{ color: '#555', fontSize: 10 }}>no risk signal matches — task appears clear</div>
                  ) : row.matched.slice(0, 5).map((m, mi) => {
                    const n = m.item.name ?? m.item.title ?? m.item.id ?? `sig-${mi}`;
                    const sev = m.item.severity ?? m.item.level ?? '';
                    return (
                      <div key={mi} style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <span style={{ flex: 1, fontSize: 10, color: '#fca5a5' }}>{n}</span>
                          {sev && (
                            <span style={{ fontSize: 9, color: '#ef4444', background: 'rgba(239,68,68,0.12)', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>{sev}</span>
                          )}
                          <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>{m.score}%</span>
                        </div>
                        <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                          <div style={{ height: '100%', width: `${m.score}%`, background: '#ef4444', borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
