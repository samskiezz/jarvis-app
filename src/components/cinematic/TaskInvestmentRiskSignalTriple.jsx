import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const TIRSIG_RE = /\b(tirsig|task[\s_-]*investment[\s_-]*risk|task[\s_-]*invest[\s_-]*risk[\s_-]*signal|investment[\s_-]*risk[\s_-]*task|hedged[\s_-]*task|unhedged[\s_-]*task[\s_-]*risk|task[\s_-]*invest[\s_-]*risk)\b/i;
const THRESHOLD = 0.07;

export function isTirsigQuery(t) { return TIRSIG_RE.test(t || ''); }

export async function buildTirsigScript() {
  try {
    const [taskRes, investRes, riskRes] = await Promise.all([
      fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
    ]);
    const tasks       = normaliseTasks(taskRes);
    const investments = normaliseInvestments(investRes);
    const risks       = normaliseRisks(riskRes);
    const classified  = tasks.map(task => classifyTask(task, investments, risks));
    const fullyHedged = classified.filter(c => c.state === 'FULLY_HEDGED').length;
    const investTask  = classified.filter(c => c.state === 'INVEST_TASK').length;
    const riskTask    = classified.filter(c => c.state === 'RISK_TASK').length;
    const unhedged    = classified.filter(c => c.state === 'UNHEDGED').length;
    const total       = classified.length;
    return `TIRSIG Coverage: ${total} tasks analysed. ` +
      `Fully hedged (invest+risk): ${fullyHedged}. ` +
      `Investment-task only: ${investTask}. ` +
      `Risk-task only: ${riskTask}. ` +
      `Unhedged: ${unhedged}. ` +
      `Coverage ratio: ${total ? Math.round((fullyHedged / total) * 100) : 0}%.`;
  } catch {
    return 'TIRSIG: unable to build coverage script — check endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  let hits = 0;
  for (const t of toks) { if (ft.some(f => f.includes(t) || t.includes(f))) hits++; }
  return hits / toks.length;
}

function normaliseTasks(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.tasks || raw?.data || raw?.items || []);
  return arr.map((t, i) => ({
    id:          t.id || t._id || `task-${i}`,
    name:        t.title || t.name || t.label || `Task ${i + 1}`,
    status:      t.status || t.state || '',
    priority:    t.priority || '',
    description: t.description || t.notes || t.summary || '',
    tags:        Array.isArray(t.tags) ? t.tags : [],
  }));
}

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.investments || raw?.data || raw?.items || []);
  return arr.map((inv, i) => ({
    id:     inv.id || inv._id || `inv-${i}`,
    name:   inv.name || inv.title || inv.ticker || `Investment ${i + 1}`,
    sector: inv.sector || inv.category || inv.type || '',
    notes:  inv.notes || inv.description || inv.summary || '',
    tags:   Array.isArray(inv.tags) ? inv.tags : [],
  }));
}

function normaliseRisks(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.riskSignals || raw?.risk_signals || raw?.data || raw?.items || []);
  return arr.map((r, i) => ({
    id:       r.id || r._id || `risk-${i}`,
    name:     r.name || r.title || r.label || `RiskSignal ${i + 1}`,
    severity: r.severity || r.level || r.priority || '',
    category: r.category || r.type || r.kind || '',
    source:   r.source || r.origin || '',
    tags:     Array.isArray(r.tags) ? r.tags : [],
  }));
}

function classifyTask(task, investments, risks) {
  const taskToks = tok(`${task.name} ${task.status} ${task.priority} ${task.description} ${task.tags.join(' ')}`);

  const matchedInvestments = investments
    .map(inv => {
      const s = Math.max(
        matchScore(taskToks, `${inv.name} ${inv.sector} ${inv.notes} ${inv.tags.join(' ')}`),
        matchScore(tok(`${inv.name} ${inv.sector}`), `${task.name} ${task.description}`)
      );
      return { ...inv, relevance: s };
    })
    .filter(inv => inv.relevance >= THRESHOLD)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5);

  const matchedRisks = risks
    .map(r => {
      const s = Math.max(
        matchScore(taskToks, `${r.name} ${r.category} ${r.severity} ${r.source} ${r.tags.join(' ')}`),
        matchScore(tok(`${r.name} ${r.category}`), `${task.name} ${task.description}`)
      );
      return { ...r, relevance: s };
    })
    .filter(r => r.relevance >= THRESHOLD)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5);

  const hasInvest = matchedInvestments.length > 0;
  const hasRisk   = matchedRisks.length > 0;
  let state;
  if (hasInvest && hasRisk)   state = 'FULLY_HEDGED';
  else if (hasInvest)         state = 'INVEST_TASK';
  else if (hasRisk)           state = 'RISK_TASK';
  else                        state = 'UNHEDGED';

  return { ...task, state, hasInvest, hasRisk, matchedInvestments, matchedRisks };
}

const STATE_COLORS = {
  FULLY_HEDGED: '#10b981',
  INVEST_TASK:  '#8b5cf6',
  RISK_TASK:    '#f59e0b',
  UNHEDGED:     '#6b7280',
};

const STATE_LABELS = {
  FULLY_HEDGED: 'Fully Hedged',
  INVEST_TASK:  'Invest-Task',
  RISK_TASK:    'Risk-Task',
  UNHEDGED:     'Unhedged',
};

export default function TaskInvestmentRiskSignalTriple() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [lastUpdated, setLast]    = useState(null);
  const [activeTab, setActiveTab] = useState('FULLY_HEDGED');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [taskRes, investRes, riskRes] = await Promise.all([
        fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
      ]);
      const tasks       = normaliseTasks(taskRes);
      const investments = normaliseInvestments(investRes);
      const risks       = normaliseRisks(riskRes);
      setRows(tasks.map(task => classifyTask(task, investments, risks)));
      setLast(new Date().toISOString());
    } catch (e) {
      setError(e.message || 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:tirsig-toggle', h);
    return () => window.removeEventListener('jarvis:tirsig-toggle', h);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const counts = {
    FULLY_HEDGED: rows.filter(r => r.state === 'FULLY_HEDGED').length,
    INVEST_TASK:  rows.filter(r => r.state === 'INVEST_TASK').length,
    RISK_TASK:    rows.filter(r => r.state === 'RISK_TASK').length,
    UNHEDGED:     rows.filter(r => r.state === 'UNHEDGED').length,
  };
  const total       = rows.length;
  const coveragePct = total ? Math.round((counts.FULLY_HEDGED / total) * 100) : 0;

  const tabRows = rows
    .filter(r => r.state === activeTab)
    .filter(r => !search || `${r.name} ${r.status} ${r.priority}`.toLowerCase().includes(search.toLowerCase()));

  const speak = useCallback(() => {
    const summary = `TIRSIG: ${total} tasks. Fully hedged: ${counts.FULLY_HEDGED}. Invest-task: ${counts.INVEST_TASK}. Risk-task: ${counts.RISK_TASK}. Unhedged: ${counts.UNHEDGED}. Coverage ${coveragePct} percent.`;
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: summary } }));
  }, [total, counts, coveragePct]);

  const assess = useCallback(async () => {
    const prompt = `TIRSIG triple coverage: ${total} tasks, ${counts.FULLY_HEDGED} fully hedged (invest+risk), ${counts.INVEST_TASK} invest-task only, ${counts.RISK_TASK} risk-task only, ${counts.UNHEDGED} unhedged. Provide a 2-sentence task investment-risk coverage assessment.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      if (res.ok) {
        const data = await res.json();
        const reply = data?.response || data?.message || data?.content || 'Assessment complete.';
        window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: reply } }));
      }
    } catch { /* silent */ }
  }, [total, counts]);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: 'fixed', bottom: 8, left: 856560, zIndex: 558,
          background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)',
          borderRadius: 6, color: '#10b981', fontSize: 10, fontFamily: 'monospace',
          padding: '2px 7px', cursor: 'pointer', whiteSpace: 'nowrap',
          backdropFilter: 'blur(4px)',
        }}
        title="Task × Investment × RiskSignal Coverage"
      >
        ◈ TIRSIG
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 558,
      background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 820, maxHeight: '88vh', overflowY: 'auto',
        background: 'rgba(10,20,30,0.97)', border: '1px solid rgba(16,185,129,0.3)',
        borderRadius: 12, padding: 24, fontFamily: 'monospace', color: '#e2e8f0',
        backdropFilter: 'blur(12px)', boxShadow: '0 0 40px rgba(16,185,129,0.15)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#10b981', letterSpacing: 1 }}>
              ◈ TIRSIG — Task × Investment × RiskSignal
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
              {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'Loading…'} · Auto-refresh 90s
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={assess} style={{ background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#10b981', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>ASSESS</button>
            <button onClick={speak}  style={{ background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>▶ TTS</button>
            <button onClick={load} disabled={loading} style={{ background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>⟳</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#f87171', marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
          {Object.entries(counts).map(([state, cnt]) => (
            <div key={state} onClick={() => setActiveTab(state)}
              style={{
                background: activeTab === state ? STATE_COLORS[state] + '22' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${activeTab === state ? STATE_COLORS[state] : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 8, padding: '10px 8px', cursor: 'pointer', textAlign: 'center',
              }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: STATE_COLORS[state] }}>{cnt}</div>
              <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>{STATE_LABELS[state]}</div>
            </div>
          ))}
        </div>

        {/* Coverage bar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
            <span>Fully hedged coverage</span><span style={{ color: '#10b981' }}>{coveragePct}%</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${coveragePct}%`, background: 'linear-gradient(90deg,#10b981,#34d399)', borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            {['FULLY_HEDGED','INVEST_TASK','RISK_TASK','UNHEDGED'].map(s => (
              <div key={s} style={{ height: 3, flex: counts[s] || 0, background: STATE_COLORS[s], borderRadius: 2, minWidth: counts[s] ? 2 : 0 }} />
            ))}
          </div>
        </div>

        {/* Tabs + search */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {Object.keys(STATE_LABELS).map(s => (
            <button key={s} onClick={() => setActiveTab(s)}
              style={{
                background: activeTab === s ? STATE_COLORS[s] + '22' : 'none',
                border: `1px solid ${activeTab === s ? STATE_COLORS[s] : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 4, color: activeTab === s ? STATE_COLORS[s] : '#64748b',
                fontSize: 10, padding: '3px 10px', cursor: 'pointer',
              }}>
              {STATE_LABELS[s]} ({counts[s]})
            </button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4, color: '#e2e8f0', fontSize: 10, padding: '3px 8px', outline: 'none', width: 150,
            }}
          />
        </div>

        {loading && (
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: 11, padding: '20px 0' }}>Loading tasks…</div>
        )}
        {!loading && tabRows.length === 0 && (
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: 11, padding: '20px 0' }}>No tasks in this state.</div>
        )}

        {/* Row list */}
        {!loading && tabRows.map(row => (
          <div key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '8px 4px', cursor: 'pointer' }}
            onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_COLORS[row.state], display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#e2e8f0' }}>{row.name}</span>
                {row.status   && <span style={{ fontSize: 9, color: '#475569', background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 5px' }}>{row.status}</span>}
                {row.priority && <span style={{ fontSize: 9, color: '#64748b', fontStyle: 'italic' }}>{row.priority}</span>}
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {row.hasInvest && <span style={{ fontSize: 9, color: '#8b5cf6', background: 'rgba(139,92,246,0.1)',  borderRadius: 3, padding: '1px 5px' }}>INVEST</span>}
                {row.hasRisk   && <span style={{ fontSize: 9, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', borderRadius: 3, padding: '1px 5px' }}>RISK</span>}
                <span style={{ fontSize: 9, color: '#64748b' }}>{expanded === row.id ? '▲' : '▼'}</span>
              </div>
            </div>

            {expanded === row.id && (
              <div style={{ marginTop: 8, paddingLeft: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* Investments pane */}
                  <div>
                    <div style={{ fontSize: 10, color: '#8b5cf6', marginBottom: 4, fontWeight: 600 }}>Investments</div>
                    {row.matchedInvestments.length === 0
                      ? <div style={{ fontSize: 10, color: '#475569' }}>No investment matches</div>
                      : row.matchedInvestments.map(inv => (
                        <div key={inv.id} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#e2e8f0' }}>
                            <span>{inv.name}</span>
                            {inv.sector && <span style={{ fontSize: 9, color: '#475569', background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 4px' }}>{inv.sector}</span>}
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, marginTop: 3 }}>
                            <div style={{ height: '100%', width: `${Math.round(inv.relevance * 100)}%`, background: '#8b5cf6', borderRadius: 2 }} />
                          </div>
                          <div style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>relevance {Math.round(inv.relevance * 100)}%</div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Risk signals pane */}
                  <div>
                    <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 4, fontWeight: 600 }}>Risk Signals</div>
                    {row.matchedRisks.length === 0
                      ? <div style={{ fontSize: 10, color: '#475569' }}>No risk signal matches</div>
                      : row.matchedRisks.map(r => (
                        <div key={r.id} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#e2e8f0' }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                            {r.severity && <span style={{ fontSize: 9, color: r.severity === 'critical' ? '#ef4444' : '#f59e0b', background: 'rgba(245,158,11,0.1)', borderRadius: 3, padding: '1px 4px', flexShrink: 0, marginLeft: 4 }}>{r.severity}</span>}
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, marginTop: 3 }}>
                            <div style={{ height: '100%', width: `${Math.round(r.relevance * 100)}%`, background: '#f59e0b', borderRadius: 2 }} />
                          </div>
                          <div style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>
                            {r.category && <span>{r.category} · </span>}relevance {Math.round(r.relevance * 100)}%
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        <div style={{ marginTop: 12, fontSize: 9, color: '#334155', textAlign: 'right' }}>
          TIRSIG · /entities/Task · /entities/Investment · /entities/RiskSignal
        </div>
      </div>
    </div>
  );
}
