/**
 * RiskSignalScenarioBrainTaskEscalation — F120
 *
 * Fetches /entities/RiskSignal + /v1/scenario/list + /v1/cinematic/brain + /entities/Task.
 *
 * Keyword-matches each risk signal (title/description/category/type/source) against
 * scenario names/descriptions, brain node labels/types, and task names/descriptions
 * to classify:
 *
 *   ESCALATED — risk signal matches scenario AND brain AND task
 *               (fully covered: threat has a defensive scenario, a brain model, and an active task)
 *   COVERED   — risk signal matches 2 of the 3 sources
 *               (partial coverage — missing one escalation layer)
 *   MODELED   — risk signal matches only 1 of the 3 sources
 *               (thin coverage — referenced but not integrated)
 *   EXPOSED   — no match to any source
 *               (full blind spot — threat with no scenario, no brain model, no task assigned)
 *
 * Toggle: ◈ RSTEX button (fixed, bottom strip) left:115560, zIndex:217
 * Stat tiles: signals / scenarios / brain nodes / tasks / escalated / covered / modeled / exposed
 * Red pulse on EXPOSED count (full defense blind spots).
 * Expandable rows: matched scenarios with status badge +
 *                  matched brain nodes with centrality score badge +
 *                  matched tasks with status badge.
 * Filter tabs: ALL / ESCALATED / COVERED / MODELED / EXPOSED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "rstex"/"risk task escalation"/"threat escalation matrix"/"exposed threat"
 *        "risk brain scenario"/"risk signal escalation"/"threat blind spot"
 *        "risk scenario brain"/"threat escalation"/"exposed risk"/"risk task brain"
 *        "risk escalation"/"undefended threat"/"undefended risk"
 * Event: jarvis:rstex-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ESCALATED', 'COVERED', 'MODELED', 'EXPOSED'];

const CLS_COLOR = {
  ESCALATED: '#22C55E',
  COVERED:   '#3B82F6',
  MODELED:   '#F97316',
  EXPOSED:   '#EF4444',
};

export function isRstexQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'rstex', 'risk task escalation', 'threat escalation matrix', 'exposed threat',
    'risk brain scenario', 'risk signal escalation', 'threat blind spot',
    'risk scenario brain', 'threat escalation', 'exposed risk', 'risk task brain',
    'risk escalation', 'undefended threat', 'undefended risk',
  ].some(kw => s.includes(kw));
}

export function buildRstexScript(q) {
  return `JARVIS risk signal threat escalation intelligence audit triggered by: "${q}". Fetch /entities/RiskSignal + /v1/scenario/list + /v1/cinematic/brain + /entities/Task. Classify each risk signal as ESCALATED/COVERED/MODELED/EXPOSED. Report the exposed count and top 3 undefended threat blind spots.`;
}

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

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function signalLabel(s) {
  return s.title || s.name || s.signal || s.type || s.id || 'Unknown';
}

function signalTokens(s) {
  return tokens(
    `${s.title || ''} ${s.name || ''} ${s.signal || ''} ${s.description || ''} ${s.category || ''} ${s.type || ''} ${s.source || ''} ${s.tags ? (Array.isArray(s.tags) ? s.tags.join(' ') : s.tags) : ''}`
  );
}

function classifySignal(signal, scenarios, brainNodes, tasks) {
  const toks = signalTokens(signal);

  const mScenarios = scenarios.filter(sc =>
    overlaps(toks, `${sc.name || ''} ${sc.title || ''} ${sc.description || ''} ${sc.category || ''} ${sc.type || ''} ${sc.objective || ''}`)
  );
  const mNodes = brainNodes.filter(n =>
    overlaps(toks, `${n.label || ''} ${n.name || ''} ${n.id || ''} ${n.type || ''} ${n.category || ''}`)
  );
  const mTasks = tasks.filter(t =>
    overlaps(toks, `${t.title || ''} ${t.name || ''} ${t.description || ''} ${t.category || ''} ${t.type || ''} ${t.status || ''}`)
  );

  const matchCount =
    (mScenarios.length > 0 ? 1 : 0) +
    (mNodes.length > 0 ? 1 : 0) +
    (mTasks.length > 0 ? 1 : 0);

  let cls;
  if (matchCount === 3) cls = 'ESCALATED';
  else if (matchCount === 2) cls = 'COVERED';
  else if (matchCount === 1) cls = 'MODELED';
  else cls = 'EXPOSED';

  return { signal, cls, mScenarios, mNodes, mTasks };
}

export default function RiskSignalScenarioBrainTaskEscalation() {
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
      const [signalsRaw, scenariosRaw, brainRaw, tasksRaw] = await Promise.all([
        fetcher('/entities/RiskSignal'),
        fetcher('/v1/scenario/list'),
        fetcher('/v1/cinematic/brain'),
        fetcher('/entities/Task'),
      ]);

      const signals    = normalizeArray(signalsRaw,   ['signals', 'risk_signals', 'data', 'items', 'results']);
      const scenarios  = normalizeArray(scenariosRaw, ['scenarios', 'data', 'items', 'results']);
      const brainNodes = normalizeArray(brainRaw,     ['nodes', 'centrality', 'data', 'items', 'results']);
      const tasks      = normalizeArray(tasksRaw,     ['tasks', 'data', 'items', 'results']);

      setRows(signals.map(s => classifySignal(s, scenarios, brainNodes, tasks)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:rstex-toggle', handler);
    return () => window.removeEventListener('jarvis:rstex-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    ESCALATED: rows.filter(r => r.cls === 'ESCALATED').length,
    COVERED:   rows.filter(r => r.cls === 'COVERED').length,
    MODELED:   rows.filter(r => r.cls === 'MODELED').length,
    EXPOSED:   rows.filter(r => r.cls === 'EXPOSED').length,
  };

  const scenarioCount = rows.reduce((n, r) => n + r.mScenarios.length, 0);
  const nodeCount     = rows.reduce((n, r) => n + r.mNodes.length,     0);
  const taskCount     = rows.reduce((n, r) => n + r.mTasks.length,     0);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return signalLabel(r.signal).toLowerCase().includes(s) ||
             (r.signal.category || r.signal.type || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Signals: ${rows.length}. Escalated: ${counts.ESCALATED}. Covered: ${counts.COVERED}. Modeled: ${counts.MODELED}. Exposed: ${counts.EXPOSED}.`;
    const prompt = `JARVIS risk signal threat escalation intelligence audit: ${summary}. Identify the most critical exposed threats — those with no defensive scenario, no brain model, and no assigned task — full defense blind spots. Provide a 2-sentence advisory on the most dangerous undefended threats and priority actions to build escalation coverage.`;
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
          position: 'fixed', bottom: 8, left: 115560, zIndex: 217,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ RSTEX</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 217, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ RSTEX</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>RiskSignal × Scenario × Brain × Task — Threat Escalation Intelligence Matrix</span>
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
          { label: 'SIGNALS',    val: rows.length,         color: '#94a3b8' },
          { label: 'SCENARIOS',  val: scenarioCount,       color: '#818cf8' },
          { label: 'BRAIN NODES',val: nodeCount,           color: '#a78bfa' },
          { label: 'TASKS',      val: taskCount,           color: '#34d399' },
          { label: 'ESCALATED',  val: counts.ESCALATED,   color: CLS_COLOR.ESCALATED },
          { label: 'COVERED',    val: counts.COVERED,     color: CLS_COLOR.COVERED },
          { label: 'MODELED',    val: counts.MODELED,     color: CLS_COLOR.MODELED },
          { label: 'EXPOSED',    val: counts.EXPOSED,     color: CLS_COLOR.EXPOSED, pulse: counts.EXPOSED > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 80, textAlign: 'center',
            animation: pulse ? 'rstex-pulse 2s ease-in-out infinite' : 'none',
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
          placeholder="search signals…"
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
                  {signalLabel(r.signal)}
                </span>
                {(r.signal.category || r.signal.severity) && (
                  <span style={{ background: '#200a0a', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.signal.severity ? `sev:${r.signal.severity}` : ''}{r.signal.severity && r.signal.category ? ' · ' : ''}{r.signal.category}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mScenarios.length > 0 && (
                    <div>
                      <div style={{ color: '#818cf8', fontSize: 10, marginBottom: 3 }}>SCENARIOS ({r.mScenarios.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mScenarios.slice(0, 8).map((s, k) => (
                          <span key={k} style={{ background: '#0c0e20', border: '1px solid #312e81', color: '#818cf8', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {s.name || s.title || s.id}
                            {s.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{s.status}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mNodes.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>BRAIN NODES ({r.mNodes.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mNodes.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#0e0720', border: '1px solid #4c1d95', color: '#a78bfa', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.id}
                            {n.centrality != null && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(+n.centrality).toFixed(3)}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mTasks.length > 0 && (
                    <div>
                      <div style={{ color: '#34d399', fontSize: 10, marginBottom: 3 }}>TASKS ({r.mTasks.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mTasks.slice(0, 8).map((t, k) => (
                          <span key={k} style={{ background: '#021a0e', border: '1px solid #065f46', color: '#34d399', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {t.title || t.name || t.id}
                            {t.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{t.status}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mScenarios.length === 0 && r.mNodes.length === 0 && r.mTasks.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No scenario, brain, or task match — full defense blind spot with zero escalation coverage.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes rstex-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
