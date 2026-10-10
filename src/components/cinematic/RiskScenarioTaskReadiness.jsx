import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';
const TABS = ['ALL', 'FULLY_PLANNED', 'SCENARIO_ONLY', 'TASK_ONLY', 'UNPLANNED'];
const CLASS_COLOR = {
  FULLY_PLANNED: '#22c55e',
  SCENARIO_ONLY: '#00bfff',
  TASK_ONLY: '#ffd700',
  UNPLANNED: '#ff4444',
};
const PULSE_STYLE = `@keyframes rsrtread-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function classifyRow(risk, scenarios, tasks) {
  const rToks = tokens(
    `${risk.title || risk.name || ''} ${risk.description || ''} ${risk.type || ''} ${risk.severity || ''} ${risk.tags || ''}`
  );
  const hitScenario = scenarios.some(s =>
    overlaps(rToks, `${s.name || s.title || ''} ${s.description || ''} ${s.type || ''} ${s.tags || ''}`)
  );
  const hitTask = tasks.some(t =>
    overlaps(rToks, `${t.name || t.title || ''} ${t.description || ''} ${t.priority || ''} ${t.tags || ''}`)
  );
  if (hitScenario && hitTask) return 'FULLY_PLANNED';
  if (hitScenario) return 'SCENARIO_ONLY';
  if (hitTask) return 'TASK_ONLY';
  return 'UNPLANNED';
}

export function isRsrtreadQuery(q) {
  return /rsrtread|risk response readiness|risk scenario task|unplanned risk response|strategic response readiness|risk task scenario|risk response planning/i.test(q);
}

export function buildRsrtreadScript() {
  return 'RSRTREAD online. Opening Risk Signal Strategic Response Readiness Nexus — correlating risk signals against scenarios and tasks.';
}

export default function RiskScenarioTaskReadiness() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [scenarioCount, setScenarioCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [assessment, setAssessment] = useState({});
  const intervalRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [riskRes, scenRes, taskRes] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`),
        fetch(`${API}/v1/scenario/list`),
        fetch(`${API}/entities/Task`),
      ]);
      const [riskData, scenData, taskData] = await Promise.all([
        riskRes.ok ? riskRes.json() : [],
        scenRes.ok ? scenRes.json() : [],
        taskRes.ok ? taskRes.json() : [],
      ]);
      const risks = Array.isArray(riskData) ? riskData : (riskData.items || riskData.data || []);
      const scenarios = Array.isArray(scenData) ? scenData : (scenData.items || scenData.data || scenData.scenarios || []);
      const tasks = Array.isArray(taskData) ? taskData : (taskData.items || taskData.data || []);
      setScenarioCount(scenarios.length);
      setTaskCount(tasks.length);

      const rToksFn = (risk) => tokens(
        `${risk.title || risk.name || ''} ${risk.description || ''} ${risk.tags || ''}`
      );

      const classified = risks.map(risk => {
        const rToks = rToksFn(risk);
        return {
          ...risk,
          _class: classifyRow(risk, scenarios, tasks),
          _matchedScenarios: scenarios.filter(s =>
            overlaps(rToks, `${s.name || s.title || ''} ${s.description || ''} ${s.type || ''} ${s.tags || ''}`)
          ).slice(0, 5),
          _matchedTasks: tasks.filter(t =>
            overlaps(rToks, `${t.name || t.title || ''} ${t.description || ''} ${t.priority || ''} ${t.tags || ''}`)
          ).slice(0, 5),
        };
      });
      // severity-sort: CRITICAL first, then HIGH, others
      const ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      classified.sort((a, b) => {
        const sa = ORDER[String(a.severity || '').toUpperCase()] ?? 9;
        const sb = ORDER[String(b.severity || '').toUpperCase()] ?? 9;
        return sa - sb;
      });
      setRows(classified);
    } catch (e) {
      setError(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rsrtread-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rsrtread-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    fetchData();
    intervalRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async (row) => {
    const key = row.id || row.title || row.name;
    setAssessing(key);
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `RSRTREAD assessment for risk signal "${row.title || row.name || row.id}" (severity: ${row.severity || 'unknown'}, class: ${row._class}). Provide a 2-sentence strategic response readiness analysis.`,
        }),
      });
      const d = await r.json();
      const text = d.response || d.answer || d.message || d.result || JSON.stringify(d);
      setAssessment(prev => ({ ...prev, [key]: text }));
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment(prev => ({ ...prev, [key]: `Error: ${e.message}` }));
    } finally {
      setAssessing(null);
    }
  }, []);

  const counts = {
    ALL: rows.length,
    FULLY_PLANNED: rows.filter(r => r._class === 'FULLY_PLANNED').length,
    SCENARIO_ONLY: rows.filter(r => r._class === 'SCENARIO_ONLY').length,
    TASK_ONLY: rows.filter(r => r._class === 'TASK_ONLY').length,
    UNPLANNED: rows.filter(r => r._class === 'UNPLANNED').length,
  };
  const covPct = counts.ALL ? Math.round((counts.FULLY_PLANNED / counts.ALL) * 100) : 0;
  const unplannedCritical = rows.filter(
    r => r._class === 'UNPLANNED' && /CRITICAL|HIGH/i.test(r.severity || '')
  ).length;

  const visible = rows.filter(r => {
    const matchTab = tab === 'ALL' || r._class === tab;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (r.title || r.name || '').toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      (r.severity || '').toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  return (
    <>
      <style>{PULSE_STYLE}</style>
      <button
        title="RSRTREAD — Risk Signal × Scenario × Task Strategic Response Readiness"
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed',
          left: 1118000,
          bottom: 8,
          zIndex: 712,
          background: 'rgba(255,68,68,0.13)',
          border: '1px solid rgba(255,68,68,0.45)',
          borderRadius: 6,
          color: '#ff4444',
          fontFamily: 'monospace',
          fontSize: 11,
          padding: '4px 9px',
          cursor: 'pointer',
          letterSpacing: 1,
          animation: 'rsrtread-pulse 3s ease-in-out infinite',
        }}
      >
        RSRTREAD
        {unplannedCritical > 0 && (
          <span style={{
            marginLeft: 5,
            background: '#ff4444',
            color: '#fff',
            borderRadius: 8,
            padding: '0 5px',
            fontSize: 10,
          }}>
            {unplannedCritical}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 713,
          background: 'rgba(0,0,0,0.82)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'monospace',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px',
            borderBottom: '1px solid rgba(255,68,68,0.3)',
            background: 'rgba(10,0,0,0.95)',
          }}>
            <span style={{ color: '#ff4444', fontSize: 14, letterSpacing: 2 }}>
              ◈ RSRTREAD — Risk Signal × Scenario × Task Strategic Response Readiness
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: 18, cursor: 'pointer' }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: 'flex', gap: 12, padding: '10px 20px',
            borderBottom: '1px solid rgba(255,68,68,0.15)',
            background: 'rgba(5,0,10,0.9)',
            flexWrap: 'wrap',
          }}>
            {[
              { label: 'RISK SIGNALS', val: counts.ALL, color: '#ff4444' },
              { label: 'SCENARIOS', val: scenarioCount, color: '#ffd700' },
              { label: 'TASKS', val: taskCount, color: '#00bfff' },
              { label: 'FULLY PLANNED', val: counts.FULLY_PLANNED, color: '#22c55e' },
              { label: 'SCENARIO ONLY', val: counts.SCENARIO_ONLY, color: '#00bfff' },
              { label: 'TASK ONLY', val: counts.TASK_ONLY, color: '#ffd700' },
              { label: 'UNPLANNED', val: counts.UNPLANNED, color: '#ff4444' },
              { label: 'COV%', val: `${covPct}%`, color: covPct >= 70 ? '#22c55e' : covPct >= 40 ? '#ffd700' : '#ff4444' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: 'rgba(255,68,68,0.06)',
                border: `1px solid ${color}33`,
                borderRadius: 6, padding: '6px 14px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80,
              }}>
                <span style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</span>
                <span style={{ color: '#666', fontSize: 9, letterSpacing: 1 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          <div style={{ padding: '6px 20px', background: 'rgba(5,0,10,0.9)' }}>
            <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${covPct}%`,
                background: covPct >= 70 ? '#22c55e' : covPct >= 40 ? '#ffd700' : '#ff4444',
                transition: 'width 0.4s',
              }} />
            </div>
          </div>

          {/* Filter + search */}
          <div style={{
            display: 'flex', gap: 8, padding: '8px 20px', flexWrap: 'wrap', alignItems: 'center',
            borderBottom: '1px solid rgba(255,68,68,0.1)',
            background: 'rgba(5,0,10,0.88)',
          }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(255,68,68,0.2)' : 'none',
                border: `1px solid ${tab === t ? '#ff4444' : 'rgba(255,68,68,0.25)'}`,
                borderRadius: 5, color: tab === t ? '#ff4444' : '#888',
                fontFamily: 'monospace', fontSize: 10, padding: '3px 10px', cursor: 'pointer',
              }}>
                {t} {counts[t] !== undefined ? `(${counts[t]})` : ''}
              </button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search signals…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,68,68,0.07)',
                border: '1px solid rgba(255,68,68,0.25)', borderRadius: 5,
                color: '#ccc', fontFamily: 'monospace', fontSize: 11,
                padding: '3px 10px', outline: 'none', width: 200,
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
            {loading && <div style={{ color: '#ff4444', padding: 12 }}>Loading…</div>}
            {error && <div style={{ color: '#f87171', padding: 12 }}>Error: {error}</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: '#555', padding: 12, fontSize: 12 }}>No risk signals match.</div>
            )}
            {visible.map(row => {
              const key = row.id || row.title || row.name;
              const isExp = expanded === key;
              const clsColor = CLASS_COLOR[row._class] || '#888';
              const isUnplanned = row._class === 'UNPLANNED';
              return (
                <div key={key} style={{
                  marginBottom: 4, borderRadius: 6,
                  border: `1px solid ${clsColor}33`,
                  background: isUnplanned ? 'rgba(255,68,68,0.04)' : 'rgba(255,255,255,0.02)',
                  animation: isUnplanned ? 'rsrtread-pulse 2.5s ease-in-out infinite' : 'none',
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 12px', cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      background: `${clsColor}22`, color: clsColor,
                      borderRadius: 4, padding: '1px 7px',
                      fontSize: 9, letterSpacing: 1, minWidth: 90, textAlign: 'center',
                    }}>
                      {row._class}
                    </span>
                    {row.severity && (
                      <span style={{
                        color: /CRITICAL/i.test(row.severity) ? '#ff4444' : /HIGH/i.test(row.severity) ? '#f97316' : '#888',
                        fontSize: 9, letterSpacing: 1,
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 3, padding: '0 5px',
                      }}>
                        {String(row.severity).toUpperCase()}
                      </span>
                    )}
                    <span style={{ color: '#c0c0c0', fontSize: 12, flex: 1 }}>
                      {row.title || row.name || key}
                    </span>
                    <span style={{ color: '#555', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: '8px 12px 12px', borderTop: '1px solid rgba(255,68,68,0.1)' }}>
                      {row.description && (
                        <div style={{ color: '#777', fontSize: 11, marginBottom: 10 }}>{row.description}</div>
                      )}

                      {/* Matched scenarios */}
                      {row._matchedScenarios.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ color: '#ffd700', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>MATCHED SCENARIOS</div>
                          {row._matchedScenarios.map((s, i) => (
                            <div key={i} style={{
                              background: 'rgba(255,215,0,0.07)', border: '1px solid rgba(255,215,0,0.25)',
                              borderRadius: 4, padding: '4px 10px', marginBottom: 3,
                              display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                              <span style={{ color: '#ffd700', fontSize: 11, flex: 1 }}>
                                {s.name || s.title || s.id}
                              </span>
                              {s.type && (
                                <span style={{ color: '#888', fontSize: 9, border: '1px solid rgba(255,215,0,0.2)', borderRadius: 3, padding: '0 5px' }}>
                                  {s.type}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Matched tasks */}
                      {row._matchedTasks.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ color: '#00bfff', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>MATCHED TASKS</div>
                          {row._matchedTasks.map((t, i) => (
                            <div key={i} style={{
                              background: 'rgba(0,191,255,0.07)', border: '1px solid rgba(0,191,255,0.25)',
                              borderRadius: 4, padding: '4px 10px', marginBottom: 3,
                              display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                              <span style={{ color: '#00bfff', fontSize: 11, flex: 1 }}>
                                {t.name || t.title || t.id}
                              </span>
                              {t.priority && (
                                <span style={{ color: '#888', fontSize: 9, border: '1px solid rgba(0,191,255,0.2)', borderRadius: 3, padding: '0 5px' }}>
                                  {t.priority}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ASSESS button */}
                      <button
                        onClick={() => assess(row)}
                        disabled={assessing === key}
                        style={{
                          background: 'rgba(255,68,68,0.15)',
                          border: '1px solid rgba(255,68,68,0.4)',
                          borderRadius: 5, color: '#ff4444',
                          fontFamily: 'monospace', fontSize: 11,
                          padding: '5px 14px', cursor: 'pointer',
                          marginTop: 4,
                          opacity: assessing === key ? 0.5 : 1,
                        }}
                      >
                        {assessing === key ? 'Assessing…' : '▶ ASSESS RESPONSE READINESS'}
                      </button>

                      {assessment[key] && (
                        <div style={{
                          marginTop: 8, padding: '8px 12px',
                          background: 'rgba(255,68,68,0.08)',
                          border: '1px solid rgba(255,68,68,0.2)',
                          borderRadius: 5, color: '#e0e0e0', fontSize: 12, lineHeight: 1.5,
                        }}>
                          {assessment[key]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: '6px 20px', borderTop: '1px solid rgba(255,68,68,0.15)',
            background: 'rgba(5,0,10,0.9)', display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <span style={{ color: '#555', fontSize: 10, letterSpacing: 1 }}>
              RSRTREAD · 90s auto-refresh · {counts.ALL} signals
            </span>
            {loading && <span style={{ color: '#ff4444', fontSize: 10 }}>⟳ refreshing…</span>}
            <button
              onClick={fetchData}
              style={{
                marginLeft: 'auto', background: 'none',
                border: '1px solid rgba(255,68,68,0.25)',
                borderRadius: 4, color: '#888', fontFamily: 'monospace',
                fontSize: 10, padding: '2px 8px', cursor: 'pointer',
              }}
            >
              ↺ refresh
            </button>
          </div>
        </div>
      )}
    </>
  );
}
