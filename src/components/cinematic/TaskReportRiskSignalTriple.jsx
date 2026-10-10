import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TRRSK_RE = /\b(trrsk|task\s+report\s+risk|task\s+risk\s+report|report\s+risk\s+task|task\s+risk\s+signal\s+report|task\s+report\s+risk\s+signal|risk\s+backed\s+task|fully\s+documented\s+task|task\s+documentation\s+risk|task\s+report\s+threat|task\s+risk\s+coverage\s+report|mission\s+risk\s+report)\b/i;

const THRESHOLD = 0.08;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  const hits = toks.filter(t => ft.includes(t)).length;
  return hits / toks.length;
}

function normaliseTasks(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.tasks) ? data.tasks
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(t => ({
    id: t.id || t._id || t.taskId || String(Math.random()),
    name: t.name || t.title || t.label || 'Unnamed Task',
    description: t.description || t.desc || t.summary || '',
    priority: t.priority || t.urgency || '',
    status: t.status || t.state || '',
    category: t.category || t.type || t.kind || '',
    tags: Array.isArray(t.tags) ? t.tags.join(' ') : String(t.tags || ''),
    raw: t,
  }));
}

function normaliseReports(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.reports) ? data.reports
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(r => ({
    id: r.id || r._id || String(Math.random()),
    title: r.title || r.name || r.label || 'Untitled Report',
    type: r.type || r.kind || r.category || '',
    summary: r.summary || r.description || r.abstract || '',
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : String(r.tags || ''),
    raw: r,
  }));
}

function normaliseRiskSignals(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.risks) ? data.risks
    : Array.isArray(data.signals) ? data.signals
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(r => ({
    id: r.id || r._id || String(Math.random()),
    name: r.name || r.title || r.label || 'Unnamed Risk',
    severity: r.severity || r.level || r.priority || '',
    category: r.category || r.type || r.kind || '',
    description: r.description || r.summary || r.detail || '',
    source: r.source || r.origin || '',
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : String(r.tags || ''),
    raw: r,
  }));
}

function correlate(tasks, reports, risks) {
  return tasks.map(task => {
    const toks = tok([task.name, task.description, task.category, task.tags].join(' '));

    const matchedReports = reports
      .map(r => {
        const score = Math.max(
          matchScore(toks, r.title),
          matchScore(toks, r.type),
          matchScore(toks, r.summary),
          matchScore(toks, r.tags),
        );
        return { ...r, score };
      })
      .filter(r => r.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedRisks = risks
      .map(r => {
        const score = Math.max(
          matchScore(toks, r.name),
          matchScore(toks, r.category),
          matchScore(toks, r.description),
          matchScore(toks, r.source),
          matchScore(toks, r.tags),
        );
        return { ...r, score };
      })
      .filter(r => r.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasReport = matchedReports.length > 0;
    const hasRisk = matchedRisks.length > 0;

    let state;
    if (hasReport && hasRisk) state = 'FULLY DOCUMENTED';
    else if (hasReport) state = 'REPORT-BACKED';
    else if (hasRisk) state = 'RISK-FLAGGED';
    else state = 'UNTRACKED';

    return { task, matchedReports, matchedRisks, state };
  });
}

export function isTrrskQuery(t) {
  return TRRSK_RE.test(t || '');
}

export async function buildTrrskScript() {
  try {
    const [tRes, rRes, rkRes] = await Promise.allSettled([
      fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : null),
    ]);
    const tasks = normaliseTasks(tRes.status === 'fulfilled' ? tRes.value : null);
    const reports = normaliseReports(rRes.status === 'fulfilled' ? rRes.value : null);
    const risks = normaliseRiskSignals(rkRes.status === 'fulfilled' ? rkRes.value : null);
    const rows = correlate(tasks, reports, risks);
    const fully = rows.filter(r => r.state === 'FULLY DOCUMENTED').length;
    const reportBacked = rows.filter(r => r.state === 'REPORT-BACKED').length;
    const riskFlagged = rows.filter(r => r.state === 'RISK-FLAGGED').length;
    const untracked = rows.filter(r => r.state === 'UNTRACKED').length;
    return `TRRSK Task×Report×RiskSignal: ${rows.length} tasks analysed. ` +
      `${fully} FULLY DOCUMENTED (report + risk signal), ` +
      `${reportBacked} REPORT-BACKED (report only), ${riskFlagged} RISK-FLAGGED (risk only), ${untracked} UNTRACKED. ` +
      (untracked > 0 ? `${untracked} tasks have no report or risk signal coverage — documentation gap.` :
        fully > 0 ? `Top documented: ${rows.find(r => r.state === 'FULLY DOCUMENTED')?.task.name || 'see panel'}.` :
        'No fully documented tasks at this time.');
  } catch {
    return 'TRRSK: data fetch failed.';
  }
}

export default function TaskReportRiskSignalTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:trrsk-toggle', handler);
    return () => window.removeEventListener('jarvis:trrsk-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [tRes, rRes, rkRes] = await Promise.allSettled([
        fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const tasks = normaliseTasks(tRes.status === 'fulfilled' ? tRes.value : null);
      const reports = normaliseReports(rRes.status === 'fulfilled' ? rRes.value : null);
      const risks = normaliseRiskSignals(rkRes.status === 'fulfilled' ? rkRes.value : null);
      if (!tasks.length && !reports.length && !risks.length) {
        setErr('No data returned from Task, Reports, or RiskSignal endpoints.');
      }
      setRows(correlate(tasks, reports, risks));
      setLastRefresh(new Date());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fully = rows.filter(r => r.state === 'FULLY DOCUMENTED').length;
  const reportBacked = rows.filter(r => r.state === 'REPORT-BACKED').length;
  const riskFlagged = rows.filter(r => r.state === 'RISK-FLAGGED').length;
  const untracked = rows.filter(r => r.state === 'UNTRACKED').length;

  const TABS = ['ALL', 'FULLY DOCUMENTED', 'REPORT-BACKED', 'RISK-FLAGGED', 'UNTRACKED'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.task.name.toLowerCase().includes(q) ||
        r.task.description.toLowerCase().includes(q) ||
        r.matchedReports.some(rp => rp.title.toLowerCase().includes(q)) ||
        r.matchedRisks.some(rk => rk.name.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const coverageBarWidth = total > 0 ? {
    fully: (fully / total) * 100,
    reportBacked: (reportBacked / total) * 100,
    riskFlagged: (riskFlagged / total) * 100,
    untracked: (untracked / total) * 100,
  } : { fully: 0, reportBacked: 0, riskFlagged: 0, untracked: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Task "${row.task.name}" [${row.state}]: ` +
      `reports: ${row.matchedReports.map(r => r.title).join(', ') || 'none'}. ` +
      `risk signals: ${row.matchedRisks.map(r => r.name).join(', ') || 'none'}. ` +
      `Priority: ${row.task.priority || 'unknown'}. Status: ${row.task.status || 'unknown'}. ` +
      `Give a 2-sentence mission report and risk coverage brief.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'No assessment returned.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }, []);

  const STATE_COLOUR = {
    'FULLY DOCUMENTED': '#00ff88',
    'REPORT-BACKED': '#00bfff',
    'RISK-FLAGGED': '#ff6b35',
    'UNTRACKED': '#555',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 812880,
          bottom: 8,
          zIndex: 480,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #00ff8844',
          color: '#00ff88',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ TRRSK
        {untracked > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#ff6b35',
            color: '#fff',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {untracked}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      right: 16,
      width: 680,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #00ff8855',
      borderRadius: 8,
      zIndex: 480,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #00ff8822',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #00ff8822',
        background: 'rgba(0,255,136,0.05)',
      }}>
        <span style={{ color: '#00ff88', fontWeight: 700, letterSpacing: 1 }}>
          ◈ TASK × REPORT × RISK SIGNAL
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastRefresh && (
            <span style={{ color: '#555', fontSize: 10 }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: 'none',
              border: '1px solid #00ff8844',
              color: '#00ff88',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 11,
            }}
          >
            {loading ? '…' : '↻'}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #00ff8811' }}>
        {[
          { label: 'FULLY DOCUMENTED', val: fully, col: '#00ff88' },
          { label: 'REPORT-BACKED', val: reportBacked, col: '#00bfff' },
          { label: 'RISK-FLAGGED', val: riskFlagged, col: '#ff6b35' },
          { label: 'UNTRACKED', val: untracked, col: '#555' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1,
            textAlign: 'center',
            background: 'rgba(0,255,136,0.04)',
            border: `1px solid ${s.col}33`,
            borderRadius: 4,
            padding: '6px 4px',
          }}>
            <div style={{ color: s.col, fontSize: 18, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#556', fontSize: 9, letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {total > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #00ff8811' }}>
          <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: '#001a0a' }}>
            <div style={{ width: `${coverageBarWidth.fully}%`, background: '#00ff88', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBarWidth.reportBacked}%`, background: '#00bfff', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBarWidth.riskFlagged}%`, background: '#ff6b35', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBarWidth.untracked}%`, background: '#333', transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 9, color: '#556' }}>
            <span style={{ color: '#00ff88' }}>■ DOCUMENTED</span>
            <span style={{ color: '#00bfff' }}>■ REPORT-BACKED</span>
            <span style={{ color: '#ff6b35' }}>■ RISK-FLAGGED</span>
            <span style={{ color: '#444' }}>■ UNTRACKED</span>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? '#00ff8822' : 'none',
              border: `1px solid ${filter === t ? '#00ff88' : '#00ff8833'}`,
              color: filter === t ? '#00ff88' : '#556',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 10,
              letterSpacing: 0.5,
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto',
            background: 'rgba(0,255,136,0.05)',
            border: '1px solid #00ff8833',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 11,
            outline: 'none',
            width: 120,
          }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{ color: '#ff6666', padding: '4px 12px', fontSize: 11 }}>⚠ {err}</div>
      )}

      {/* Rows */}
      <div style={{ padding: '0 0 8px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#444', textAlign: 'center', padding: 24, fontSize: 12 }}>
            No matching tasks.
          </div>
        )}
        {visible.map((row) => {
          const isExp = expanded === row.task.id;
          const stateCol = STATE_COLOUR[row.state] || '#888';
          return (
            <div
              key={row.task.id}
              style={{
                borderBottom: '1px solid #00ff880d',
                background: isExp ? 'rgba(0,255,136,0.03)' : 'transparent',
              }}
            >
              {/* Row header */}
              <div
                onClick={() => setExpanded(isExp ? null : row.task.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: stateCol,
                  flexShrink: 0,
                  boxShadow: `0 0 6px ${stateCol}`,
                }} />
                <span style={{ flex: 1, fontWeight: 600, color: '#d0eeff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.task.name}
                </span>
                <span style={{ color: stateCol, fontSize: 9, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                  {row.state}
                </span>
                {row.task.priority && (
                  <span style={{ color: '#ffbb00', fontSize: 9, marginLeft: 4 }}>
                    P:{row.task.priority}
                  </span>
                )}
                {row.task.status && (
                  <span style={{ color: '#556', fontSize: 9, marginLeft: 4 }}>
                    [{row.task.status}]
                  </span>
                )}
                <span style={{ color: '#00ff8844', fontSize: 10, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded split pane */}
              {isExp && (
                <div style={{ padding: '0 12px 10px' }}>
                  {row.task.description && (
                    <div style={{ color: '#667', fontSize: 11, marginBottom: 8 }}>
                      {row.task.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    {/* Left: matched reports */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#00bfff', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        REPORTS ({row.matchedReports.length})
                      </div>
                      {row.matchedReports.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No reports matched.</div>
                      )}
                      {row.matchedReports.slice(0, 5).map(r => (
                        <div key={r.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#c8e6ff', fontWeight: 600 }}>{r.title}</span>
                            <span style={{ color: '#00bfff', fontSize: 10 }}>{(r.score * 100).toFixed(0)}%</span>
                          </div>
                          {r.type && (
                            <span style={{
                              display: 'inline-block',
                              background: '#00bfff22',
                              color: '#00bfff',
                              borderRadius: 3,
                              padding: '1px 5px',
                              fontSize: 9,
                              marginTop: 2,
                            }}>
                              {r.type}
                            </span>
                          )}
                          <div style={{ height: 3, background: '#001a2a', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(r.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #00bfff, #007aa3)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right: matched risk signals */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#ff6b35', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        RISK SIGNALS ({row.matchedRisks.length})
                      </div>
                      {row.matchedRisks.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No risk signals matched.</div>
                      )}
                      {row.matchedRisks.slice(0, 5).map(rk => (
                        <div key={rk.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#ffc8a0', fontWeight: 600 }}>{rk.name}</span>
                            <span style={{ color: '#ff6b35', fontSize: 10 }}>{(rk.score * 100).toFixed(0)}%</span>
                          </div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                            {rk.severity && (
                              <span style={{
                                background: rk.severity.toLowerCase() === 'critical' ? '#ff000033' : '#ff6b3522',
                                color: rk.severity.toLowerCase() === 'critical' ? '#ff4444' : '#ff6b35',
                                borderRadius: 3,
                                padding: '1px 5px',
                                fontSize: 9,
                              }}>
                                {rk.severity}
                              </span>
                            )}
                            {rk.category && (
                              <span style={{
                                background: '#ff6b3515',
                                color: '#ff9966',
                                borderRadius: 3,
                                padding: '1px 5px',
                                fontSize: 9,
                              }}>
                                {rk.category}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, background: '#2a0a00', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(rk.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #ff6b35, #cc4400)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ASSESS button */}
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      marginTop: 8,
                      background: 'rgba(0,255,136,0.08)',
                      border: '1px solid #00ff8855',
                      color: '#00ff88',
                      padding: '3px 14px',
                      borderRadius: 3,
                      cursor: assessing ? 'wait' : 'pointer',
                      fontSize: 11,
                      letterSpacing: 1,
                    }}
                  >
                    {assessing ? 'ASSESSING…' : 'ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
